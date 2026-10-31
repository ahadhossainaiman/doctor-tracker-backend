# Doctor Tracker API

Secure admin API for managing doctors, their patients, and clinic analytics. The Next.js client talks to this service over REST. Sessions stay in httpOnly cookies.

## Description

Doctor Tracker is an administrative portal for a clinic. Authenticated staff register doctors, attach patients to a doctor, and review how the practice is growing. This service is the system of record: it checks every request, pages and filters large lists through MongoDB indexes, and returns dashboard numbers the client can chart. A denormalized patient count on each doctor keeps the “patients per doctor” view to a single indexed read.

## Setup Guide

Requirements:

- Node.js 20.19 or newer
- MongoDB 7
- npm

1. Install dependencies and create the local environment file.

   ```bash
   npm install
   ```

   macOS and Linux:

   ```bash
   cp .env.example .env
   ```

   Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   `.env.example` is the only environment file in git. Replace the JWT secrets before any shared deployment. `CLIENT_ORIGIN` must be the browser origin of the admin app, default `http://localhost:3000`.

2. Load the admin account and sample clinical data.

   ```bash
   npm run seed
   ```

   The seed upserts the admin on every run. It inserts 200 doctors and 5,000 patients only when the doctors collection is empty. Sample records use a fixed faker seed, so a fresh database is reproducible.

   Development login, from `.env.example`:

   | Field    | Value                         |
   | -------- | ----------------------------- |
   | Email    | `admin@doctortracker.local`   |
   | Password | `ChangeMe123!`                |
   | Name     | `Admin`                       |

3. Start the API.

   ```bash
   npm run dev
   ```

   The process listens on `http://localhost:4000` after MongoDB connects. Confirm it with `GET /api/v1/health`, which returns `{ "success": true, "data": { "status": "ok" } }`.

### Scripts

| Script            | Purpose                                                         |
| ----------------- | --------------------------------------------------------------- |
| `npm run dev`     | Run with reload on file changes                                 |
| `npm run build`   | Compile TypeScript to `dist/`                                   |
| `npm start`       | Run the compiled server                                         |
| `npm run lint`    | Lint the project                                                |
| `npm run typecheck` | Type-check application and tests                              |
| `npm test`        | Auth, list filters, patient counts, and index plans             |
| `npm run seed`    | Create the admin and, if needed, sample doctors and patients    |
| `npm run recount` | Rebuild every `patientCount` from the patients collection       |
| `npm run explain` | Print the winning index plan for each main list query           |

A Postman collection is in `postman/Doctor-Tracker-API.postman_collection.json`. Import it, enable the cookie jar, and sign in with the seed account. Later requests reuse the session.

### Docker

`docker compose up --build` starts the API and a single-node MongoDB replica set named `rs0`. Inside that network the API uses `MONGODB_URI=mongodb://mongo:27017/doctor-tracker?replicaSet=rs0`, so a patient write and its count update commit in one transaction.

A local standalone MongoDB still runs the application. Count updates then run as sequential writes, and `npm run recount` rebuilds the counters if they drift.

## System Architecture

```
Browser
  Next.js admin (http://localhost:3000)
  rewrites /api/* to the API and sends cookies
        |
        v
Express API (http://localhost:4000/api/v1)
  request id, helmet, CORS allow-list, cookies, JSON limit, mongo-sanitize
  routes -> controllers -> services -> Mongoose models
        |
        v
MongoDB
  users, doctors, patients
```

**Sign in.** `POST /api/v1/auth/login` checks the password with bcrypt (cost 12) and sets two httpOnly cookies: `accessToken` for 15 minutes and `refreshToken` for 7 days. The refresh token is stored as a SHA-256 hash next to a `tokenVersion`. `POST /api/v1/auth/refresh` issues a new access cookie when the token, hash, and version still match. Logout increments `tokenVersion` and clears both cookies. Five failed logins for the same IP and email within 15 minutes return `429`.

**Lists.** Query parameters are validated with Zod. The service runs `find` and `countDocuments` together, with `lean()`, a field projection, and a limit capped at 50. A single search token matches the start of a field or a whole word inside it, so `card` finds Cardiology and `Ward` finds a last name. A query of several words uses the text index. A phone-shaped patient search uses an anchored prefix on `{phone:1}`.

**Patient writes.** Creating, deleting, or reassigning a patient adjusts `doctor.patientCount` with `$inc` in the same service call. On a replica set that pair is one transaction. Deleting a doctor returns `409` while any patient still references that doctor.

**Dashboard.** Summary, charts, and `GET /meta/filters` are cached in process memory for 60 seconds. Doctor and patient writes clear that cache. Chart routes return `{ labels, values }`. The time series fills empty days, weeks, or months so the client can draw a continuous line.

The API is stateless aside from that short cache. Horizontal scale means more API processes behind a load balancer, cursor pagination when `skip` becomes expensive, and Redis when the cache must be shared. Read replicas can serve the dashboard aggregations.

## Technical Decisions

### 1. Denormalized `patientCount`, with compound indexes

The patients-per-doctor chart and the sort by workload read `doctor.patientCount` through `{patientCount:-1}`. That is an index read of a fixed limit. Counting patients at request time, or joining with `$lookup`, would rescan the patients collection on every dashboard load.

The tradeoff is consistency. Each create, delete, and reassignment updates the counter in the same service call, inside a transaction when the deployment is a replica set. `npm run recount` is the repair path: it groups patients by doctor and writes the totals back. The same idea covers the other hot paths. Specialization, hospital, condition, gender, and registration date each have a compound index so filters and the default sorts do not scan the collection.

### 2. httpOnly cookie sessions

Access and refresh tokens are JWTs in httpOnly cookies, with `SameSite=Lax` by default and `Secure` in production. Browser script cannot read them, so a cross-site script cannot exfiltrate the session the way it can with a token in `localStorage`.

The access token carries the user id and role and is checked without a database read. The refresh token is revocable: logout bumps `tokenVersion`, and a stolen refresh cookie fails the hash check after that. The admin app keeps filters in the URL and server data in its own cache. This API does not accept an `Authorization` header.

Role checks are still explicit. Feature routes require an admin access token and return `403` for any other role, even though the seed creates only one admin.

## Visual Evidence

The interface is the companion Next.js application. This repository serves the data those screens request. Reviewers should capture the admin app at desktop and mobile widths after signing in with the seed account.

| View     | What to capture                                                                 |
| -------- | ------------------------------------------------------------------------------- |
| Desktop  | Dashboard KPIs and charts, the doctors table with filters, a doctor profile, the patients table |
| Mobile   | The same four screens at 360px, with bottom navigation and filters in a sheet  |

Suggested paths when those captures are stored with the client: `docs/screenshots/desktop.png` and `docs/screenshots/mobile.png`.

## API

Base URL: `http://localhost:4000/api/v1`.

Success:

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 } }
```

`meta` is present on paginated lists. Error:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

Status codes in use: `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`. Validation failures are `422`. A duplicate email is `409`.

| Method | Path                               | Auth           | Purpose                                                    |
| ------ | ---------------------------------- | -------------- | ---------------------------------------------------------- |
| GET    | `/health`                          | Public         | Liveness                                                   |
| POST   | `/auth/login`                      | Public         | Set session cookies. Rate limited                          |
| POST   | `/auth/refresh`                    | Refresh cookie | Issue a new access cookie                                  |
| POST   | `/auth/logout`                     | Public         | Revoke the refresh token and clear both cookies            |
| GET    | `/auth/me`                         | Admin          | Current user                                               |
| GET    | `/doctors`                         | Admin          | `q`, `specialization`, `hospital`, `from`, `to`, `sort`, `order`, `page`, `limit` |
| POST   | `/doctors`                         | Admin          | Create. Required: name, specialization, hospital, phone, email |
| GET    | `/doctors/:id`                     | Admin          | Profile                                                    |
| PATCH  | `/doctors/:id`                     | Admin          | Partial update                                             |
| DELETE | `/doctors/:id`                     | Admin          | Delete. `409` while patients remain                       |
| GET    | `/doctors/:id/patients`            | Admin          | That doctor's patients, paginated, with search             |
| POST   | `/doctors/:id/patients`            | Admin          | Add a patient and increment `patientCount`                 |
| DELETE | `/doctors/:id/patients/:patientId` | Admin          | Remove that patient and decrement `patientCount`           |
| GET    | `/patients`                        | Admin          | `q`, `condition`, `doctor`, `gender`, `from`, `to`, `sort`, `order`, `page`, `limit` |
| GET    | `/patients/:id`                    | Admin          | Profile, including the doctor name                         |
| PATCH  | `/patients/:id`                    | Admin          | Edit. A new `doctor` moves the patient and both counts     |
| DELETE | `/patients/:id`                    | Admin          | Delete and decrement `patientCount`                        |
| GET    | `/meta/filters`                    | Admin          | Distinct specializations, hospitals, and conditions        |
| GET    | `/dashboard/summary`               | Admin          | Four KPIs plus the five latest doctors and patients        |
| GET    | `/dashboard/patients-per-doctor`   | Admin          | Top doctors by `patientCount`. Query: `limit` (default 10) |
| GET    | `/dashboard/timeseries`            | Admin          | Registrations over time. `range=7d\|30d\|90d\|12m`, optional `interval=day\|week\|month` |
| GET    | `/dashboard/conditions`            | Admin          | Patients by condition. Top `limit` (default 6) plus `Other` |
| GET    | `/dashboard/specializations`       | Admin          | Doctors grouped by specialization                          |

List defaults are page 1 and limit 10. Limit cannot exceed 50. Dates are UTC. `from` and `to` use `YYYY-MM-DD` and include that whole day. On doctors they filter `createdAt`. On patients they filter `registeredAt`.

Doctor sort fields: `name`, `createdAt` (default), `patientCount`. Patient sort fields: `name`, `registeredAt` (default), `age`, `createdAt`. Order is `asc` or `desc`.

Summary fields: `totalDoctors`, `totalPatients`, `patientsThisMonth`, `averagePatientsPerDoctor`, `recentDoctors`, `recentPatients`. Sparklines and period deltas are derived by the client from the time series.

### Indexes

| Query                                      | Index                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Doctors, default or `sort=createdAt`       | `{createdAt:-1}`                                                      |
| Doctors filtered by specialization         | `{specialization:1, createdAt:-1}`                                    |
| Doctors filtered by hospital               | `{hospital:1, createdAt:-1}`                                          |
| Doctors `sort=patientCount`                | `{patientCount:-1}`                                                   |
| Doctors `sort=name`                        | `{name:1}`                                                            |
| Doctors `q`, one token                     | Prefix or word match on name, specialization, and hospital            |
| Doctors `q`, several words                 | Text index `{name, specialization, hospital}`                         |
| One doctor's patients                      | `{doctor:1, registeredAt:-1}`                                         |
| Patients filtered by condition             | `{condition:1, registeredAt:-1}`                                      |
| Patients filtered by registration date     | `{registeredAt:-1}`                                                   |
| Patients filtered by gender                | `{gender:1, registeredAt:-1}`                                         |
| Patients phone search                      | `{phone:1}`, anchored prefix                                          |
| Patients `q`, one token                    | Prefix or word match on name and condition                            |
| Patients `q`, several words                | Text index `{name, condition}`                                        |
| Patients `sort=name`                       | `{name:1}`                                                            |
| Patients per doctor                        | `{patientCount:-1}`                                                   |
| Time series                                | `$match` on `{registeredAt:-1}`, then `$dateTrunc`                    |
| Conditions                                 | `$match` `{condition:{$gte:''}}` on `{condition:1, registeredAt:-1}`  |
| Specializations                            | `$match` `{specialization:{$gte:''}}` on `{specialization:1, createdAt:-1}` |

`npm run explain` prints the winning plan for the seeded database. `npm test` fails if a covered list or aggregation plan is a collection scan.

### Dashboard pipelines

Patients per doctor is a find, not an aggregation:

```js
Doctor.find({ patientCount: { $gt: 0 } })
  .sort({ patientCount: -1 })
  .limit(limit);
```

Time series. `7d` and `30d` group by day, `90d` by week (Monday start), and `12m` by month. `interval` overrides that default.

```js
[
  { $match: { registeredAt: { $gte: from, $lte: to } } },
  {
    $group: {
      _id: { $dateTrunc: { date: '$registeredAt', unit, timezone: 'UTC' } },
      count: { $sum: 1 },
    },
  },
  { $sort: { _id: 1 } },
]
```

Empty buckets are filled in the service.

Conditions. The handler keeps `limit` rows and sums the remainder as `Other`.

```js
[
  { $match: { condition: { $gte: '' } } },
  { $group: { _id: '$condition', count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
]
```

Specializations:

```js
[
  { $match: { specialization: { $gte: '' } } },
  { $group: { _id: '$specialization', count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
  { $limit: 50 },
]
```

## Environment

| Variable              | Required  | Purpose                                                                 |
| --------------------- | --------- | ----------------------------------------------------------------------- |
| `NODE_ENV`            | No        | `development`, `test`, or `production`. Default `development`           |
| `PORT`                | No        | HTTP port. Default `4000`                                               |
| `MONGODB_URI`         | Yes       | `mongodb://` or `mongodb+srv://`                                        |
| `CLIENT_ORIGIN`       | Yes       | Comma-separated browser origins allowed to send credentials             |
| `JWT_ACCESS_SECRET`   | Yes       | Access-token secret, at least 32 characters                             |
| `JWT_REFRESH_SECRET`  | Yes       | Refresh-token secret, at least 32 characters                            |
| `COOKIE_HTTPONLY`     | No        | Default `true`                                                          |
| `COOKIE_SECURE`       | No        | Default `true` in production. Required when `COOKIE_SAMESITE` is `none` |
| `COOKIE_SAMESITE`     | No        | `lax`, `strict`, or `none`. Default `lax`                               |
| `SEED_ADMIN_NAME`     | Seed only | Default `Admin`                                                         |
| `SEED_ADMIN_EMAIL`    | Seed only | Admin email                                                             |
| `SEED_ADMIN_PASSWORD` | Seed only | At least 8 characters                                                   |

## Scope

This repository is the Express API. The Next.js admin application owns the login screen, navigation, tables, charts, confirmations, and responsive layout. It should proxy `/api/*` to this service and send `credentials: 'include'`. On `401` it calls `POST /api/v1/auth/refresh` once and retries. A failed refresh returns the user to the login page.
