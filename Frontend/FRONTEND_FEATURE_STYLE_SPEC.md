# GAK Frontend: Full Feature + Styling Specification

This document describes the current frontend exactly as implemented in code, including styling system, routes, components, and UI interactions.

## 1. Scope and Codebase Shape

1. Frontend framework: React + TypeScript + Vite.
2. UI stack: Tailwind CSS + shadcn/ui + Radix primitives.
3. Animation stack: Framer Motion.
4. Charting stack: Recharts.
5. Data fetching infra present: React Query provider is wired, but pages currently use mock data.
6. Main shell files:
7. `/Users/vaishnav/Documents/GAK/Frontend/src/main.tsx`
8. `/Users/vaishnav/Documents/GAK/Frontend/src/App.tsx`
9. `/Users/vaishnav/Documents/GAK/Frontend/src/index.css`
10. `/Users/vaishnav/Documents/GAK/Frontend/tailwind.config.ts`

## 2. Global Styling System

1. Theme mode architecture:
2. Theme classes are class-based (`dark`, `light`) and controlled by `ThemeProvider`.
3. Default theme is dark (`ThemeProvider defaultTheme="dark"`).
4. Theme persists to localStorage key: `gka-ui-theme`.
5. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/ThemeProvider.tsx`.

6. Color token system (HSL custom properties in `:root` + `.dark` + `.light`):
7. Base semantic tokens: `--background`, `--foreground`, `--card`, `--secondary`, `--muted`, `--border`, `--ring`, etc.
8. Brand/pillar tokens: `--gak`, `--gyaan`, `--karma`, `--ahara`.
9. Status tokens: `--safe`, `--warning`, `--critical`.
10. Sidebar token set included for shadcn sidebar compatibility.
11. File: `/Users/vaishnav/Documents/GAK/Frontend/src/index.css`.

12. Visual style direction:
13. Dark gradient/glass visual language.
14. Heavy use of translucent cards (`glass-card`) with blur, gradient fills, subtle borders, and shadows.
15. Sticky blurred headers on most pages.
16. Rounded corners are consistently large (`rounded-xl`, `rounded-2xl`, pills).

17. Utility classes defined in `index.css`:
18. `glass`, `glass-card`, `glass-card-elevated`.
19. Glow utilities: `glow-primary`, `glow-gyaan`, `glow-karma`, `glow-ahara`.
20. Gradient helpers: `bg-gradient-dark`, `bg-gradient-radial`, gradient text classes.
21. Noise overlay utility (`noise-overlay::before`).
22. Pillar helper classes: `pillar-gyaan`, `pillar-karma`, `pillar-ahara`.
23. Status helpers: `status-safe`, `status-warning`, `status-critical`.
24. Animation helpers: `animate-float`, `animate-pulse-slow`, `animate-glow`.

25. Typography and spacing:
26. Tailwind extended font family uses `Inter` with system fallback.
27. Mobile-first spacing and card-driven sections.
28. Frequent use of `text-xs` metadata, `text-sm` body labels, and bold numeric KPIs.

29. Tailwind extension summary:
30. Extended color map includes semantic and pillar colors.
31. Extended radii include `2xl`, `3xl`.
32. Added keyframes: `fade-in`, `fade-up`, `scale-in`, `slide-up`, shimmer.
33. `tailwindcss-animate` plugin enabled.
34. File: `/Users/vaishnav/Documents/GAK/Frontend/tailwind.config.ts`.

35. Base button variants (shadcn):
36. Variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`.
37. Sizes: `default`, `sm`, `lg`, `icon`.
38. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/ui/button.tsx`.

## 3. Metadata and Brand Assets

1. App favicon: `/favicon.ico`.
2. Browser metadata title: `GAK - Student Day Assistant`.
3. OG/Twitter image currently points to `/favicon.ico`.
4. File: `/Users/vaishnav/Documents/GAK/Frontend/index.html`.

## 4. Routing and Page Map

1. `/` -> Welcome.
2. `/auth` -> Auth + onboarding.
3. `/home` -> Trinity dashboard.
4. `/gyaan` -> Academics module with tabs (attendance, timetable, marks).
5. `/marks` -> Dedicated marks page.
6. `/karma` -> Fitness module.
7. `/ahara` -> Nutrition module.
8. `/planner` -> AI plan + calendar.
9. `/profile` -> Account and integrations.
10. `/history/workout` -> Workout analytics.
11. `/history/nutrition` -> Nutrition analytics.
12. `/history/academic` -> Academic analytics.
13. `*` -> Not Found screen.
14. File: `/Users/vaishnav/Documents/GAK/Frontend/src/App.tsx`.

## 5. Global Navigation and Shared Interaction

1. Bottom navigation fixed bar:
2. Tabs: Home, Gyaan, Karma, Ahara, Plan.
3. Active indicator: animated top bar via `layoutId="nav-indicator"`.
4. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/BottomNav.tsx`.

5. Swipe navigation across major pages:
6. Route order for swipe: `/home` -> `/gyaan` -> `/karma` -> `/ahara` -> `/planner`.
7. Horizontal swipe threshold: 60px.
8. Vertical-dominant gestures ignored.
9. Files:
10. `/Users/vaishnav/Documents/GAK/Frontend/src/components/SwipeContainer.tsx`
11. `/Users/vaishnav/Documents/GAK/Frontend/src/hooks/useSwipeNavigation.ts`

12. Profile side menu (`ProfileMenu`):
13. Right-side animated drawer with blurred backdrop.
14. Header: generic student identity.
15. Menu items: Profile, Academic History, Workout History, Nutrition History, Attendance History.
16. Footer: Theme toggle + logout button.
17. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/ProfileMenu.tsx`.

## 6. Page-by-Page Features and Controls

### 6.1 Welcome (`/`)

1. Visual structure:
2. Full-screen background image with gradient overlay.
3. Animated circular logo glow with favicon image centered.
4. Pillar icon row (Academics, Fitness, Nutrition).
5. Large colored G-A-K hero text.
6. Pillar cards and CTA area at bottom.

7. Buttons/controls:
8. `Get Started` -> `navigate("/auth")`.
9. `I already have an account` -> `navigate("/auth?mode=signin")`.
10. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Welcome.tsx`.

### 6.2 Auth + Onboarding (`/auth`)

1. Modes:
2. Sign-up and sign-in mode toggle.
3. URL query param `mode=signin` preselects sign-in.

4. Auth form controls:
5. Back icon button -> `navigate("/")`.
6. Name input shown only in sign-up.
7. Email/University ID input.
8. Password input.
9. Password visibility toggle (eye icon).
10. Primary submit button text changes by mode.
11. Bottom mode-switch text button (`Sign up`/`Sign in`).

12. Onboarding steps after sign-up submit:
13. Step 1 Integrations: cards for Google Calendar, Google Fit, SRM Academia with `Connect` buttons.
14. Step 2 Workout plan: upload prompt card with `Choose File` button.
15. Step 3 Goals: selectable goal rows (Weight Loss, Muscle Gain, Maintain).
16. Navigation buttons in steps: `Skip`, `Continue`, `Get Started`.

17. Behavior notes:
18. Auth and onboarding currently route-based mock flow only, no backend auth.
19. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Auth.tsx`.

### 6.3 Home (`/home`)

1. Header:
2. Greeting + student name placeholder.
3. Favicon logo image.
4. Menu icon opens ProfileMenu.

5. Feature blocks:
6. Daily optimization score card with animated circular progress ring.
7. Trinity cards (Gyaan/Karma/Ahara) with colored left border and progress bar.
8. Priorities section with `View Plan` link.

9. Controls:
10. Menu icon button -> open side menu.
11. Each Trinity card -> navigate to corresponding module route.
12. `View Plan` button -> `navigate("/planner")`.
13. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Home.tsx`.

### 6.4 Gyaan (`/gyaan`)

1. Header + tabs:
2. Back button -> `/home`.
3. Menu button -> ProfileMenu.
4. Segmented tab buttons: `Attendance`, `Timetable`, `Marks`.

5. Attendance tab features:
6. Overall attendance KPI card with ring chart.
7. Refresh icon button (UI only).
8. Subject summary mini-cards (subjects count, below-75 count, status).
9. `Predict Attendance` button opens bottom sheet prediction tool.
10. Subject cards include attended/conducted, total, needed classes, progress bar, advisory text.

11. Timetable tab features:
12. Day order summary card.
13. Embedded `TimetableView` with day navigation and class priority cards.

14. Marks tab features:
15. Summary status chip (`Risky`/`Moderate`/`Good`) and risk count.
16. Refresh icon button (UI only).
17. Insight card about exam prioritization.
18. Subject cards with expandable breakdown.
19. New standing chip implemented: `You are in top X%`.
20. Expanded section shows `Section Rank` and `You are in top X%` again.

21. Controls:
22. Tab buttons switch local `viewMode`.
23. Attendance `Predict Attendance` opens `AttendancePrediction`.
24. Each marks subject row toggles expanded state.
25. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Gyaan.tsx`.

### 6.5 Dedicated Marks Page (`/marks`)

1. Similar pattern to Gyaan marks tab but separate route.
2. Header, summary status, insight card, expandable subject cards.
3. No section percentile chip here yet.
4. Controls:
5. Back button -> `/gyaan`.
6. Menu open.
7. Expand/collapse subject rows.
8. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Marks.tsx`.

### 6.6 Karma (`/karma`)

1. Header and module identity.
2. Google Fit connection card.
3. Environment context chips (temperature/location).
4. Today's workout plan card with exercise list.
5. Completion state card appears after done/skip.
6. Stats grid: steps, calories, sleep, heart rate with progress bars.
7. Body metrics card set.
8. Heart rate details card.
9. Weekly bar-like step chart.

10. Controls:
11. Back button -> `/home`.
12. Menu button.
13. Google Fit `Connect` button (UI only).
14. `Workout Done` button.
15. `Skip Today` button.
16. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Karma.tsx`.

### 6.7 Ahara (`/ahara`)

1. Header and module identity.
2. Calories overview with progress bar.
3. AI/protein alert card.
4. Primary food logging action row.
5. Macro cards, additional nutrients, micronutrient progress list, hydration strip, meal cards.

6. Controls:
7. Back button -> `/home`.
8. Menu button.
9. `Log Food with AI` button.
10. Icon-only image upload button.
11. Pending meal `Add` button on dinner row.
12. Opens `FoodImageLogger` bottom sheet.
13. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Ahara.tsx`.

### 6.8 Planner (`/planner`)

1. Header with current date and menu.
2. Toggle between `Calendar` and `Daily Plan` views.
3. AI plan view shows scheduled blocks with typed styling.
4. Calendar view includes compact month grid, event dots, legend.
5. Deadline intelligence cards always shown below.
6. DayGoalsPopup appears on date click.

7. Controls:
8. Menu button.
9. View toggle buttons.
10. Month previous/next buttons.
11. Date cell buttons open popup.
12. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Planner.tsx`.

### 6.9 Profile (`/profile`)

1. Header and user profile block.
2. Theme section with ThemeToggle.
3. Integrations cards with connect/disconnect/sync controls.
4. Workout plan upload card.
5. History quick links.
6. Sign-out flow with confirmation state.

7. Controls:
8. Back button -> `/home`.
9. Menu button.
10. Integration `Connect`, `Disconnect`, `Sync` actions.
11. Workout `Upload` button.
12. History item buttons -> navigate to history routes.
13. `Sign Out` toggles confirm state.
14. `Cancel` and final `Sign Out` in confirmation card.
15. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Profile.tsx`.

### 6.10 History: Workout (`/history/workout`)

1. Header, range toggle, export action.
2. Summary KPIs.
3. Steps line chart.
4. Calories bar chart.
5. Activity distribution pie.
6. AI insights list.

7. Controls:
8. Back button -> `/profile`.
9. Menu button.
10. Range buttons (`weekly`, `monthly`, `yearly`).
11. `PDF` button opens Export dialog.
12. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/HistoryWorkout.tsx`.

### 6.11 History: Nutrition (`/history/nutrition`)

1. Header, range toggle, export action.
2. Summary KPIs.
3. Calorie bars with legend.
4. Macro distribution pie.
5. Protein trend line.
6. AI insights list.

7. Controls:
8. Back button -> `/profile`.
9. Menu button.
10. Range buttons.
11. `PDF` export flow.
12. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/HistoryNutrition.tsx`.

### 6.12 History: Academic (`/history/academic`)

1. Header, range toggle, export action.
2. Summary KPIs.
3. GPA line chart.
4. Attendance bar chart.
5. Credit distribution pie.
6. AI insights list.

7. Controls:
8. Back button -> `/profile`.
9. Menu button.
10. Range buttons (`semester`, `year`, `all time`).
11. `PDF` export flow.
12. File: `/Users/vaishnav/Documents/GAK/Frontend/src/pages/HistoryAcademic.tsx`.

### 6.13 NotFound and Index

1. NotFound (`*`): simple 404 message and `Return to Home` anchor.
2. Logs a console error when route missing.
3. Index page exists but is not wired in current router map.
4. Files:
5. `/Users/vaishnav/Documents/GAK/Frontend/src/pages/NotFound.tsx`
6. `/Users/vaishnav/Documents/GAK/Frontend/src/pages/Index.tsx`

## 7. Reusable Overlay and Utility Components

### 7.1 AttendancePrediction

1. Bottom-sheet predictor from Gyaan attendance tab.
2. Date range pickers using shadcn Calendar + Popover.
3. Toggle: assume leave for all classes.
4. `Run Prediction` computes projected attendance by subject.
5. Result cards show predicted status color + delta.
6. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/AttendancePrediction.tsx`.

### 7.2 TimetableView

1. Day order selector with left/right chevrons.
2. Day quick buttons 1..5.
3. Class list cards with priority labels:
4. Must attend, Attend if possible, Safe to skip.
5. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/TimetableView.tsx`.

### 7.3 FoodImageLogger

1. Bottom-sheet food logging flow with two steps: upload and review.
2. Upload section: camera-style dropzone and `Use Demo Image`.
3. Review section: selectable items, edit/remove, macro summary, add manual item.
4. Final action: `Confirm & Log Meal (n items)`.
5. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/FoodImageLogger.tsx`.

### 7.4 ExportPDFDialog

1. Bottom drawer modal for selecting range and downloading report.
2. Range buttons: Daily/Weekly/Monthly/Yearly.
3. Final `Download PDF` button triggers callback.
4. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/ExportPDFDialog.tsx`.

### 7.5 DayGoalsPopup

1. Centered popup for selected planner date.
2. Lists goal rows with pillar icons and color-coded dots.
3. Closes by backdrop or X button.
4. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/DayGoalsPopup.tsx`.

### 7.6 Theme Toggle

1. Icon button toggles dark/light with animated sun/moon icon swap.
2. Uses `useTheme` context.
3. File: `/Users/vaishnav/Documents/GAK/Frontend/src/components/ThemeToggle.tsx`.

### 7.7 Legacy/Unused Compatibility Components

1. `MarksView` exists and renders a marks dashboard, but is not used by routes.
2. `NavLink` wrapper exists for router class compatibility, not used in main pages.
3. Files:
4. `/Users/vaishnav/Documents/GAK/Frontend/src/components/MarksView.tsx`
5. `/Users/vaishnav/Documents/GAK/Frontend/src/components/NavLink.tsx`

## 8. Button/Action Inventory (Cross-App)

1. Authentication CTA buttons: Get Started, Sign In/Create Account, mode switch, onboarding controls.
2. Navigation controls: Back buttons on all module/history pages, bottom nav tab buttons, menu buttons.
3. View mode controls: Gyaan tab switches, Planner tab switches, history range switches.
4. Expand/collapse controls: marks cards (Gyaan and `/marks`).
5. Data operation style controls: Connect/Disconnect/Sync, Upload, Log Food, Add item, Confirm meal, Run prediction, Export download.
6. Confirmation controls: Sign-out confirm/cancel.
7. Utility controls: Theme toggle, calendar month nav, date select cells, day order selectors.

## 9. Data and Backend State

1. Current data sources are mock constants inside page/component files.
2. No live API calls from pages.
3. React Query provider is present but not currently used for remote queries.
4. `generatePDF` currently exports an HTML file (`.html`) despite UI labeling it PDF.
5. File: `/Users/vaishnav/Documents/GAK/Frontend/src/lib/pdfExport.ts`.

## 10. Behavior Notes and Known Gaps (Important for Codex handoff)

1. Many action buttons are UI stubs (`console.log` or no-op visual action): integration connect/disconnect/sync, Google Fit connect, upload placeholders.
2. `ProfileMenu` includes `Attendance History` route (`/history/attendance`) but no route exists in `App.tsx`.
3. `Index.tsx` and `App.css` are mostly template leftovers and not active in current route flow.
4. Export action naming mismatch: UI says PDF; implementation downloads HTML.
5. Gyaan class-standing chip is currently computed from mocked `sectionMarks` arrays, not backend section data.

## 11. Fast Implementation Priorities (if Codex should preserve current UX)

1. Keep the glass-card visual system and sticky blurred headers as a non-negotiable base pattern.
2. Preserve bottom nav + swipe route ordering and behavior.
3. Preserve tab/segmented controls on Gyaan, Planner, and history pages.
4. Preserve colored pillar language consistently:
5. Gyaan -> blue family.
6. Karma -> green family.
7. Ahara -> amber family.
8. Preserve animated micro-feedback (progress bars, card entrances, drawer slides).

