const pool = require("../config/db");

function pickAllowed(value, allowed, fallback) {
  const v = String(value || "").toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

function toIsoDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function isoDaysAgo(days) {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  return toIsoDate(dt);
}

async function getAcademicProfile(userId) {
  const [rows] = await pool.execute(
    `SELECT program, current_semester, section_id
     FROM academic_profile
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || { program: null, current_semester: null, section_id: null };
}

function gradePointFromPct(pct) {
  if (pct >= 90) return 10;
  if (pct >= 80) return 9;
  if (pct >= 70) return 8;
  if (pct >= 60) return 7;
  if (pct >= 50) return 6;
  return 0;
}

function computeInsightsAcademic({ attendancePercent, cgpa }) {
  const insights = [];
  if (typeof attendancePercent === "number") {
    if (attendancePercent < 65) insights.push("Attendance is critical. Prioritize classes until you recover above 75%.");
    else if (attendancePercent < 75) insights.push("Attendance is below 75%. Avoid skipping near-term classes.");
    else insights.push("Attendance is in a safe zone. Maintain consistency to keep buffer.");
  }

  if (typeof cgpa === "number") {
    if (cgpa >= 8.5) insights.push("CGPA is strong. Keep focusing on weak components to sustain the trend.");
    else if (cgpa >= 7.5) insights.push("CGPA is moderate. A few component improvements can move you up.");
    else insights.push("CGPA needs attention. Target one subject at a time and improve internals.");
  }

  return insights.slice(0, 3);
}

async function getAcademicHistory(userId, range) {
  const selected = pickAllowed(range, ["semester", "year", "all"], "semester");
  const profile = await getAcademicProfile(userId);

  const sinceDate = selected === "year" ? isoDaysAgo(365) : null;
  const semester = selected === "semester" ? Number(profile.current_semester || 0) : null;

  const markFilters = [];
  const markParams = [userId];
  if (sinceDate) {
    markFilters.push("m.recorded_at >= ?");
    markParams.push(`${sinceDate} 00:00:00`);
  }
  if (semester) {
    markFilters.push("s.semester = ?");
    markParams.push(semester);
  }
  const markWhere = markFilters.length ? `AND ${markFilters.join(" AND ")}` : "";

  const attendanceFilters = [];
  const attendanceParams = [userId];
  if (sinceDate) {
    attendanceFilters.push("a.class_date >= ?");
    attendanceParams.push(sinceDate);
  }
  if (semester) {
    attendanceFilters.push("s.semester = ?");
    attendanceParams.push(semester);
  }
  const attendanceWhere = attendanceFilters.length ? `AND ${attendanceFilters.join(" AND ")}` : "";

  const [[cgpaRow]] = await pool.execute(
    `WITH subject_avgs AS (
      SELECT
        m.subject_id,
        AVG((m.score / NULLIF(m.max_score, 0)) * 100) AS avg_pct
      FROM marks_record m
      JOIN subject s ON s.subject_id = m.subject_id
      WHERE m.user_id = ?
      ${markWhere}
      GROUP BY m.subject_id
    ),
    subject_gp AS (
      SELECT
        sa.subject_id,
        CASE
          WHEN sa.avg_pct >= 90 THEN 10
          WHEN sa.avg_pct >= 80 THEN 9
          WHEN sa.avg_pct >= 70 THEN 8
          WHEN sa.avg_pct >= 60 THEN 7
          WHEN sa.avg_pct >= 50 THEN 6
          ELSE 0
        END AS gp
      FROM subject_avgs sa
    )
    SELECT
      ROUND(SUM(sg.gp * s.credits) / NULLIF(SUM(s.credits), 0), 2) AS cgpa
    FROM subject_gp sg
    JOIN subject s ON s.subject_id = sg.subject_id`,
    markParams
  );

  const cgpa = cgpaRow && cgpaRow.cgpa !== null ? Number(cgpaRow.cgpa) : null;

  const [[attendanceRow]] = await pool.execute(
    `SELECT
      ROUND((SUM(a.attended) / NULLIF(COUNT(*), 0)) * 100, 2) AS attendance_percentage
     FROM attendance_record a
     JOIN subject s ON s.subject_id = a.subject_id
     WHERE a.user_id = ?
     ${attendanceWhere}`,
    attendanceParams
  );

  const attendancePercent =
    attendanceRow && attendanceRow.attendance_percentage !== null ? Number(attendanceRow.attendance_percentage) : null;

  const [gpaTrendRows] = await pool.execute(
    `WITH subject_avgs AS (
      SELECT
        s.semester,
        m.subject_id,
        AVG((m.score / NULLIF(m.max_score, 0)) * 100) AS avg_pct
      FROM marks_record m
      JOIN subject s ON s.subject_id = m.subject_id
      WHERE m.user_id = ?
      GROUP BY s.semester, m.subject_id
    ),
    subject_gp AS (
      SELECT
        semester,
        subject_id,
        CASE
          WHEN avg_pct >= 90 THEN 10
          WHEN avg_pct >= 80 THEN 9
          WHEN avg_pct >= 70 THEN 8
          WHEN avg_pct >= 60 THEN 7
          WHEN avg_pct >= 50 THEN 6
          ELSE 0
        END AS gp
      FROM subject_avgs
    )
    SELECT
      sg.semester,
      ROUND(SUM(sg.gp * s.credits) / NULLIF(SUM(s.credits), 0), 2) AS cgpa
    FROM subject_gp sg
    JOIN subject s ON s.subject_id = sg.subject_id
    GROUP BY sg.semester
    ORDER BY sg.semester ASC`,
    [userId]
  );

  const gpaTrend = (gpaTrendRows || []).map((r) => ({ semester: Number(r.semester), cgpa: Number(r.cgpa) }));

  const [attendanceByMonthRows] = await pool.execute(
    `SELECT
      DATE_FORMAT(a.class_date, '%b') AS month_label,
      DATE_FORMAT(a.class_date, '%Y-%m') AS month_key,
      ROUND((SUM(a.attended) / NULLIF(COUNT(*), 0)) * 100, 2) AS attendance_percentage
     FROM attendance_record a
     JOIN subject s ON s.subject_id = a.subject_id
     WHERE a.user_id = ?
     ${attendanceWhere}
     GROUP BY month_key, month_label
     ORDER BY month_key ASC`,
    attendanceParams
  );

  const attendanceByMonth = (attendanceByMonthRows || []).map((r) => ({
    month: String(r.month_label),
    key: String(r.month_key),
    attendancePercentage: Number(r.attendance_percentage || 0)
  }));

  const creditWhere = [];
  const creditParams = [];
  if (profile.program) {
    creditWhere.push("program = ?");
    creditParams.push(profile.program);
  }
  if (semester) {
    creditWhere.push("semester = ?");
    creditParams.push(semester);
  }

  const [creditRows] = await pool.execute(
    `SELECT subject_name, credits
     FROM subject
     ${creditWhere.length ? `WHERE ${creditWhere.join(" AND ")}` : ""}
     ORDER BY subject_name ASC`,
    creditParams
  );

  const creditDistribution = { core: 0, elective: 0, lab: 0 };
  for (const row of creditRows || []) {
    const name = String(row.subject_name || "").toLowerCase();
    const credits = Number(row.credits || 0);
    if (/lab|laboratory|practical/.test(name)) creditDistribution.lab += credits;
    else if (/elective/.test(name) || credits <= 3) creditDistribution.elective += credits;
    else creditDistribution.core += credits;
  }

  const [subjectSummaryRows] = await pool.execute(
    `WITH mark_avg AS (
      SELECT m.subject_id, ROUND(AVG((m.score / NULLIF(m.max_score, 0)) * 100), 2) AS avg_pct
      FROM marks_record m
      JOIN subject s ON s.subject_id = m.subject_id
      WHERE m.user_id = ?
      ${markWhere}
      GROUP BY m.subject_id
    ),
    att_avg AS (
      SELECT a.subject_id, ROUND((SUM(a.attended) / NULLIF(COUNT(*), 0)) * 100, 2) AS att_pct
      FROM attendance_record a
      JOIN subject s ON s.subject_id = a.subject_id
      WHERE a.user_id = ?
      ${attendanceWhere}
      GROUP BY a.subject_id
    )
    SELECT
      s.subject_id,
      s.subject_name,
      s.credits,
      ma.avg_pct,
      aa.att_pct
    FROM subject s
    LEFT JOIN mark_avg ma ON ma.subject_id = s.subject_id
    LEFT JOIN att_avg aa ON aa.subject_id = s.subject_id
    ${semester ? "WHERE s.semester = ?" : ""}
    ORDER BY s.subject_name ASC`,
    semester ? [...markParams, ...attendanceParams, semester] : [...markParams, ...attendanceParams]
  );

  const subjects = (subjectSummaryRows || []).map((r) => ({
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    credits: Number(r.credits || 0),
    averagePercentage: r.avg_pct === null || r.avg_pct === undefined ? null : Number(r.avg_pct),
    attendancePercentage: r.att_pct === null || r.att_pct === undefined ? null : Number(r.att_pct)
  }));

  const insights = computeInsightsAcademic({ attendancePercent, cgpa });

  return {
    range: selected,
    kpis: {
      cgpa,
      attendancePercent,
      semester: profile.current_semester === null || profile.current_semester === undefined ? null : Number(profile.current_semester)
    },
    gpaTrend,
    attendanceByMonth,
    creditDistribution,
    subjects,
    insights
  };
}

function computeInsightsFitness({ completionRate, stepsTotal }) {
  const insights = [];
  if (typeof completionRate === "number") {
    if (completionRate >= 80) insights.push("Workout adherence is strong this period. Keep the streak.");
    else if (completionRate >= 50) insights.push("Workout adherence is moderate. Try protecting your workout time window.");
    else insights.push("Workout adherence is low. Start with shorter sessions and build consistency.");
  }
  if (typeof stepsTotal === "number") {
    if (stepsTotal >= 70000) insights.push("Great weekly movement volume. Recovery and sleep matter.");
    else if (stepsTotal >= 35000) insights.push("Movement is decent. Add a short walk on low-activity days.");
  }
  return insights.slice(0, 3);
}

async function getFitnessHistory(userId, range) {
  const selected = pickAllowed(range, ["week", "month", "year"], "week");
  const sinceDate = selected === "week" ? isoDaysAgo(6) : selected === "month" ? isoDaysAgo(29) : isoDaysAgo(364);

  const [actionRows] = await pool.execute(
    `SELECT
      COUNT(*) AS total_actions,
      SUM(CASE WHEN LOWER(status) IN ('done', 'completed') THEN 1 ELSE 0 END) AS completed_actions,
      SUM(CASE WHEN LOWER(status) = 'skipped' THEN 1 ELSE 0 END) AS skipped_actions
     FROM workout_action
     WHERE user_id = ? AND performed_at >= ?`,
    [userId, `${sinceDate} 00:00:00`]
  );

  const totalActions = Number(actionRows?.[0]?.total_actions || 0);
  const completedActions = Number(actionRows?.[0]?.completed_actions || 0);
  const skippedActions = Number(actionRows?.[0]?.skipped_actions || 0);
  const completionRate = totalActions ? Number(((completedActions / totalActions) * 100).toFixed(2)) : 0;

  let fitRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT metric_date, steps, calories
       FROM fit_daily_metric
       WHERE user_id = ? AND metric_date >= ?
       ORDER BY metric_date ASC`,
      [userId, sinceDate]
    );
    fitRows = rows || [];
  } catch (error) {
    if (error && (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_TABLE_ERROR")) {
      fitRows = [];
    } else {
      throw error;
    }
  }

  const fitSeries = (fitRows || []).map((r) => ({
    date: String(r.metric_date).slice(0, 10),
    steps: r.steps === null || r.steps === undefined ? null : Number(r.steps),
    calories: r.calories === null || r.calories === undefined ? null : Number(r.calories)
  }));

  const stepsTotal = fitSeries.reduce((sum, r) => sum + (typeof r.steps === "number" ? r.steps : 0), 0);

  const [activityRows] = await pool.execute(
    `SELECT activity_type, COUNT(*) AS count
     FROM activity_log
     WHERE user_id = ? AND DATE(start_time) >= ?
     GROUP BY activity_type
     ORDER BY count DESC`,
    [userId, sinceDate]
  );

  const activityBreakdown = (activityRows || []).map((r) => ({ type: r.activity_type, count: Number(r.count || 0) }));

  const insights = computeInsightsFitness({ completionRate, stepsTotal });

  return {
    range: selected,
    sinceDate,
    kpis: {
      completionRate,
      completedActions,
      skippedActions,
      totalActions
    },
    fitSeries,
    activityBreakdown,
    insights
  };
}

function computeInsightsNutrition({ avgCalories, proteinTotal, days }) {
  const insights = [];
  if (typeof avgCalories === "number") {
    if (avgCalories >= 2200) insights.push("Average calories are high this period. Watch late snacks and portions.");
    else if (avgCalories > 0 && avgCalories < 1400) insights.push("Average calories are low. Ensure you're not under-fueling.");
  }
  if (typeof proteinTotal === "number" && typeof days === "number" && days > 0) {
    const avgProtein = proteinTotal / days;
    if (avgProtein >= 90) insights.push("Protein intake is strong. Keep consistency across days.");
    else if (avgProtein >= 50) insights.push("Protein is moderate. Add a protein source in one meal.");
    else insights.push("Protein is low. Add eggs, paneer, dal, chicken, or whey.");
  }
  return insights.slice(0, 3);
}

async function getNutritionHistory(userId, range) {
  const selected = pickAllowed(range, ["week", "month", "year"], "week");
  const sinceDate = selected === "week" ? isoDaysAgo(6) : selected === "month" ? isoDaysAgo(29) : isoDaysAgo(364);

  let dailyRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT log_date, total_calories, total_protein, total_carbs, total_fats
       FROM Daily_Nutrition_View
       WHERE user_id = ? AND log_date >= ?
       ORDER BY log_date ASC`,
      [userId, sinceDate]
    );
    dailyRows = rows || [];
  } catch (error) {
    if (error && (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_TABLE_ERROR")) {
      // Fallback if the view was not created: compute from base tables.
      const [rows] = await pool.execute(
        `SELECT
          DATE(fi.uploaded_at) AS log_date,
          ROUND(SUM(cfi.calories * cfi.quantity), 2) AS total_calories,
          ROUND(SUM(cfi.protein * cfi.quantity), 2) AS total_protein,
          ROUND(SUM(cfi.carbs * cfi.quantity), 2) AS total_carbs,
          ROUND(SUM(cfi.fats * cfi.quantity), 2) AS total_fats
         FROM food_image fi
         JOIN detected_food_item dfi ON fi.image_id = dfi.image_id
         JOIN confirmed_food_item cfi ON dfi.detected_id = cfi.detected_id
         WHERE fi.user_id = ? AND DATE(fi.uploaded_at) >= ?
         GROUP BY DATE(fi.uploaded_at)
         ORDER BY log_date ASC`,
        [userId, sinceDate]
      );
      dailyRows = rows || [];
    } else {
      throw error;
    }
  }

  const series = (dailyRows || []).map((r) => ({
    date: String(r.log_date).slice(0, 10),
    calories: Number(r.total_calories || 0),
    protein: Number(r.total_protein || 0),
    carbs: Number(r.total_carbs || 0),
    fats: Number(r.total_fats || 0)
  }));

  const days = series.length;
  const totalCalories = series.reduce((s, d) => s + d.calories, 0);
  const totalProtein = series.reduce((s, d) => s + d.protein, 0);
  const totalCarbs = series.reduce((s, d) => s + d.carbs, 0);
  const totalFats = series.reduce((s, d) => s + d.fats, 0);

  const avgCalories = days ? Number((totalCalories / days).toFixed(2)) : 0;
  const overLimitDays = series.filter((d) => d.calories > 2000).length;

  const insights = computeInsightsNutrition({ avgCalories, proteinTotal: totalProtein, days });

  return {
    range: selected,
    sinceDate,
    kpis: {
      avgCalories,
      overLimitDays,
      daysLogged: days
    },
    series,
    macroTotals: {
      protein: Number(totalProtein.toFixed(2)),
      carbs: Number(totalCarbs.toFixed(2)),
      fats: Number(totalFats.toFixed(2))
    },
    insights
  };
}

module.exports = {
  getAcademicHistory,
  getFitnessHistory,
  getNutritionHistory
};
