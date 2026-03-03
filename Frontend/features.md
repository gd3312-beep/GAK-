# GAK Frontend Features (Detailed Technical Breakdown)

This file documents how the current frontend works in detail, including feature logic, status rules, colors, controls, goals, and UX behavior.

## 1. Product Scope

GAK = **Gyaan (Academics)** + **Karma (Fitness)** + **Ahara (Nutrition)**.

Current state:

1. Frontend is fully designed and interactive.
2. Most business data is mock data in page/component files.
3. Core UX exists for:
4. Attendance and marks intelligence.
5. Timetable and planner.
6. Fitness and nutrition tracking UI.
7. History analytics (charts + export dialog).

## 2. Global Design System

Primary files:

1. `/Users/vaishnav/Documents/GAK/Frontend/src/index.css`
2. `/Users/vaishnav/Documents/GAK/Frontend/tailwind.config.ts`
3. `/Users/vaishnav/Documents/GAK/Frontend/src/components/ui/button.tsx`

### 2.1 Theme model

1. Theme modes: `dark`, `light`, `system`.
2. Runtime provider: `ThemeProvider`.
3. Default app theme: `dark`.
4. Storage key: `gka-ui-theme`.

### 2.2 Core color tokens

HSL tokens from `index.css`:

1. `--gyaan`: blue academic tone.
2. `--karma`: green fitness tone.
3. `--ahara`: amber nutrition tone.
4. `--gak`: blended brand color.
5. `--safe`: green status.
6. `--warning`: amber/yellow status.
7. `--critical`: red status.

### 2.3 Glassmorphism style primitives

Reusable utility classes:

1. `glass-card`: blurred, rounded, bordered translucent card.
2. `glass-card-elevated`: same base plus stronger shadow for overlays/sheets.
3. `backdrop-blur-xl` + soft gradients used heavily in headers, menus, and sheets.

### 2.4 Button system

Via shadcn variant model:

1. Variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`.
2. Sizes: `sm`, `default`, `lg`, `icon`.
3. Many page buttons further override with pillar-specific classes (`bg-gyaan`, `bg-karma`, etc.).

## 3. App Routing and Navigation

Route map from `App.tsx`:

1. `/` -> Welcome.
2. `/auth` -> Auth + onboarding.
3. `/home` -> Home dashboard.
4. `/gyaan` -> Gyaan module (attendance/timetable/marks tabs).
5. `/marks` -> dedicated marks page.
6. `/karma` -> fitness module.
7. `/ahara` -> nutrition module.
8. `/planner` -> planner/calendar.
9. `/profile` -> profile/integrations.
10. `/history/workout`, `/history/nutrition`, `/history/academic` -> history analytics.
11. `*` -> NotFound.

Global navigation behavior:

1. Bottom nav tabs: Home, Gyaan, Karma, Ahara, Plan.
2. Swipe navigation across main module pages:
3. Route sequence: `/home` -> `/gyaan` -> `/karma` -> `/ahara` -> `/planner`.
4. Horizontal swipe threshold: 60 px.
5. Vertical-dominant gestures are ignored.

## 4. Gyaan Module (Most Important Logic)

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Gyaan.tsx`

Top-level states:

1. `viewMode`: `attendance | timetable | marks`.
2. `currentDayOrder`: active day order for timetable.
3. `predictionOpen`: attendance predictor bottom sheet.
4. `expandedMark`: expanded subject id in marks section.

### 4.1 Attendance tab

Data source:

1. `mockData.subjects[]` with fields:
2. `attended`, `conducted`, `totalSemester`, `attendance`, `status`, `requiredForMin`, `advice`.

Displayed features:

1. Overall attendance KPI ring.
2. Subject count.
3. Subjects below 75%.
4. Overall status (`At Risk` if below-75 exists else `Safe`).
5. Subject cards with:
6. attended/conducted.
7. total classes.
8. required classes to reach minimum (`+N` or check mark).
9. attendance progress bar.
10. advisory text.

Status color mappings:

1. `safe` -> green classes and icon.
2. `warning` -> amber classes and icon.
3. `critical` -> red classes and icon.

### 4.2 Attendance prediction (bottom sheet)

File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/AttendancePrediction.tsx`

Inputs:

1. Date range (`fromDate`, `toDate`).
2. Toggle: `assumeLeaveAll` (assume student misses all scheduled classes in date range).

Core algorithm:

1. Generate all interval days via `eachDayOfInterval`.
2. Remove weekends with `isWeekend`.
3. Determine day-order per date using `getDayOrderForDate`.
4. `getDayOrderForDate` uses a cycle anchor at `new Date(2026, 0, 5)` (Monday).
5. If weekend, day-order returns `0`.
6. For each subject, count missed classes where date day-order is in subject's `subjectDayFrequency`.
7. Compute:
8. `newConducted = conducted + missedClasses`.
9. `predictedAttendance = round(attended / newConducted * 100)`.
10. `delta = predictedAttendance - currentAttendance`.

Predicted status thresholds:

1. `>= 75` -> `safe`.
2. `>= 65` and `< 75` -> `warning`.
3. `< 65` -> `critical`.

UI output:

1. Subject row with predicted percentage.
2. Color-coded status icon.
3. Delta badge when negative.
4. Insight text (`N classes missed`, etc.).

### 4.3 Timetable tab

Feature source:

1. Inline summary card (today + next day order).
2. Embedded component: `TimetableView`.

`TimetableView` behavior:

1. Day order controls:
2. Prev/next arrows clamped to day 1..5.
3. Direct day buttons for 1..5.
4. Class list by day order from `timetableData`.
5. Priority categories:
6. `must-attend` -> critical red.
7. `attend-if-possible` -> warning amber.
8. `safe-to-skip` -> safe green.

### 4.4 Marks tab (including top percentile logic)

Displayed features:

1. Overall marks status chip:
2. If any high-risk subject exists -> `Risky`.
3. Else if any medium-risk subject exists -> `Moderate`.
4. Else -> `Good`.
5. AI insight card.
6. Subject cards with:
7. risk pill (`On Track`, `Needs Focus`, `At Risk`).
8. average score and bar fill.
9. directive text.
10. standing chip (`You are in top X%`).
11. expandable component-wise breakdown.

#### Top percentile logic (newly added)

Per subject:

1. `sectionMarks` array models classmates' marks (mocked).
2. Build class pool: `classScores = [...sectionMarks, userAverage]`.
3. Count classmates strictly better than user:
4. `betterCount = classScores.filter(score > userAverage).length`.
5. Compute rank:
6. `rank = betterCount + 1`.
7. Class size:
8. `classSize = classScores.length`.
9. Percentile phrasing:
10. `topPercent = max(1, round((rank / classSize) * 100))`.
11. Display text:
12. `You are in top {topPercent}%`.

Standing color logic:

1. `topPercent <= 10` -> safe green chip/text.
2. `topPercent <= 25` -> warning amber chip/text.
3. Else -> critical red chip/text.

Expanded details also show:

1. `Section Rank: rank/classSize`.
2. same `You are in top X%` label.
3. exam readiness status.

## 5. Dedicated Marks Page (`/marks`)

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Marks.tsx`

Behavior:

1. Similar card style as Gyaan marks.
2. Summary status, risk counters, AI insight, expandable subject breakdown.
3. Does not currently include percentile chip logic.

## 6. Planner Module (`/planner`)

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Planner.tsx`

Modes:

1. `ai` mode:
2. Daily schedule cards with typed styles:
3. `study`, `assignment` -> Gyaan styling.
4. `workout`, `break` -> Karma styling.
5. `meal` -> Ahara styling.

6. `calendar` mode:
7. Compact month grid.
8. Date dots indicate goals/events.
9. Event dot colors:
10. `gyaan`, `karma`, `ahara`, `personal` (purple).
11. Date click opens DayGoalsPopup.

Always-visible deadline block:

1. Deadlines include `safe`, `needs-attention`, `at-risk`.
2. Status mapping:
3. `safe` -> green.
4. `needs-attention` -> amber.
5. `at-risk` -> red.
6. Each card includes progress bar and microcopy.

## 7. Day Goals Popup

File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/DayGoalsPopup.tsx`

Features:

1. Center popup modal with backdrop.
2. Shows selected date title.
3. Lists goals for that date:
4. Goal types: `gyaan`, `karma`, `ahara`, `personal`.
5. Icon + color mapped per type.
6. Empty state: `No planned goals yet`.

## 8. Karma Module (`/karma`)

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Karma.tsx`

Sections:

1. Google Fit connection card.
2. Environment chips (temperature + location).
3. Today's workout plan:
4. exercise list with sets/reps.
5. AI tip.
6. action buttons:
7. `Workout Done`.
8. `Skip Today`.
9. Post-completion confirmation card.

10. Stats grid with progress bars:
11. Steps.
12. Calories.
13. Sleep.
14. Heart rate.

15. Body metrics:
16. Weight and BMI.

17. Heart details:
18. Current, resting, max.

19. Weekly steps bar visualization.

## 9. Ahara Module (`/ahara`)

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Ahara.tsx`

Sections:

1. Calorie overview with consumed/goal/remaining and progress bar.
2. AI insight / low-protein alert card.
3. Food logging CTA row:
4. `Log Food with AI`.
5. icon-only image action.

6. Macro cards:
7. Protein (can be low alert/critical).
8. Carbs.
9. Fats.

10. Additional nutrients:
11. Fiber, Sugar, Sodium.

12. Micronutrients list with progress bars:
13. Vitamin D, Iron, Calcium, B12.

14. Hydration strip:
15. filled glasses vs target.

16. Today's meals:
17. shows time, content, calories if logged.
18. pending meal row has `Add` button.

### 9.1 Food image logging sheet

File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/FoodImageLogger.tsx`

Flow:

1. Upload step:
2. camera dropzone and `Use Demo Image`.
3. hidden file input supports image capture.

4. Review step:
5. item checklist with confirm checkbox.
6. edit mode for item name/quantity.
7. remove item.
8. add item manually.
9. macro totals summary (calories/protein/carbs/fats).
10. final `Confirm & Log Meal`.

## 10. Profile Module (`/profile`)

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Profile.tsx`

Sections:

1. User identity card.
2. Theme setting with toggle.
3. Integrations section:
4. SRM Academia.
5. Google Fit.
6. Google Calendar.
7. Connected rows show sync and disconnect controls.
8. Non-connected rows show connect button.

9. Workout plan upload card.
10. History navigation cards:
11. Academic History.
12. Workout History.
13. Nutrition History.

14. Sign-out with confirmation state (`Cancel` and `Sign Out`).

## 11. History Analytics Pages

### 11.1 Workout history

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/HistoryWorkout.tsx`

Features:

1. Range toggles (`week`, `month`, `year`).
2. KPIs.
3. Steps line chart.
4. Calories bar chart.
5. Activity pie chart.
6. AI insights.
7. Export dialog trigger (`PDF` button).

### 11.2 Nutrition history

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/HistoryNutrition.tsx`

Features:

1. Range toggles.
2. Nutrition KPIs.
3. Calorie bar trend.
4. Macro pie chart.
5. Protein line trend.
6. AI insights.
7. Export dialog.

### 11.3 Academic history

File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/HistoryAcademic.tsx`

Features:

1. Range toggles (`semester`, `year`, `all`).
2. CGPA/attendance/semester KPI cards.
3. GPA line chart.
4. Attendance bar chart.
5. Credit distribution pie chart.
6. AI insights.
7. Export dialog.

## 12. Export Flow (all history pages)

Components:

1. `ExportPDFDialog` bottom drawer for range selection.
2. `generatePDF(title, range)` handler.

Technical note:

1. Export currently creates and downloads an **HTML file** (not true PDF).
2. File naming: `${title}_${range}_${YYYY-MM-DD}.html`.
3. File: `/Users/vaishnav/Documents/GAK/Frontend/src/lib/pdfExport.ts`.

## 13. Profile Menu Drawer (global)

File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/ProfileMenu.tsx`

Features:

1. Right-side animated drawer.
2. Backdrop click to close.
3. User avatar and email placeholder.
4. Menu links:
5. Profile.
6. Academic History.
7. Workout History.
8. Nutrition History.
9. Attendance History (route currently not implemented in router).
10. Theme toggle in footer.
11. Logout button.

## 14. Buttons and Controls Inventory (Important)

Major controls across app:

1. Navigation:
2. Back buttons on module/history pages.
3. Bottom nav tabs.
4. Swipe gestures.
5. Profile menu button (hamburger).

6. View switches:
7. Gyaan: Attendance/Timetable/Marks.
8. Planner: Calendar/Daily Plan.
9. History range toggles.

10. Data and action controls:
11. Attendance prediction run.
12. Marks row expand/collapse.
13. Workout done/skip.
14. Food log upload/review/confirm.
15. Integrations connect/disconnect/sync.
16. Theme toggle.
17. Export dialog range and download.
18. Sign-out confirm/cancel.

## 15. Goal Systems in UI

There are two main goal concepts:

1. Onboarding personal goals (`Weight Loss`, `Muscle Gain`, `Maintain`) in Auth flow.
2. Planner day goals/events (`gyaan/karma/ahara/personal`) shown as date dots and popup items.

Deadline goal-state model in Planner:

1. `safe`.
2. `needs-attention`.
3. `at-risk`.

Each has:

1. Pill color.
2. Progress value.
3. AI microcopy.

## 16. Known Current Limitations

1. Most data is mock, not backend-synced.
2. Several buttons are UX stubs (`console.log`, placeholder flows).
3. `/history/attendance` link exists in side menu but route is missing.
4. `NotFound` logs 404 in console.
5. Export says PDF but produces HTML.

## 17. Quick Reference Files

Core:

1. `/Users/vaishnav/Documents/GAK/Frontend/src/App.tsx`
2. `/Users/vaishnav/Documents/GAK/Frontend/src/index.css`
3. `/Users/vaishnav/Documents/GAK/Frontend/tailwind.config.ts`

Gyaan and logic-heavy features:

1. `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Gyaan.tsx`
2. `/Users/vaishnav/Documents/GAK/Frontend/src/components/AttendancePrediction.tsx`
3. `/Users/vaishnav/Documents/GAK/Frontend/src/components/TimetableView.tsx`

Planner goals:

1. `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Planner.tsx`
2. `/Users/vaishnav/Documents/GAK/Frontend/src/components/DayGoalsPopup.tsx`

Nutrition logger:

1. `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Ahara.tsx`
2. `/Users/vaishnav/Documents/GAK/Frontend/src/components/FoodImageLogger.tsx`

Export flow:

1. `/Users/vaishnav/Documents/GAK/Frontend/src/components/ExportPDFDialog.tsx`
2. `/Users/vaishnav/Documents/GAK/Frontend/src/lib/pdfExport.ts`
