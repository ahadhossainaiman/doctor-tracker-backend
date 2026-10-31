# Doctor Tracker API

## Elevator Pitch

Doctor Tracker API is the admin backend for a clinic portal. It authenticates a single admin with httpOnly cookies, then lists, filters, and pages doctors and patients without collection scans. Patient totals stay on each doctor so the dashboard can chart load in one indexed read.

## Setup Guide

Requirements: Node.js 20.19 or newer, and MongoDB 7.

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

The API listens on `http://localhost:4000`. Health check: `GET /api/v1/health`.

Seed login (from `.env.example`):

- email: `admin@doctortracker.local`
- password: `ChangeMe123!`

`npm run seed` creates that admin and, when the doctors collection is empty, 200 doctors and 5,000 patients. Run it again and it only refreshes the admin.

Useful scripts:

| Script                        | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `npm run dev`                 | Restart on change                               |
| `npm run build` / `npm start` | Compile and run `dist/`                         |
| `npm run lint`                | ESLint                                          |
| `npm test`                    | Auth, list filters, patient counts, index plans |
| `npm run recount`             | Rebuild `patientCount` from patients            |
| `npm run explain`             | Print the winning index for each list query     |

Docker (API + a single-node replica set, so patient-count transactions work):

```bash
docker compose up --build
```

Inside that network the API uses `MONGODB_URI=mongodb://mongo:27017/doctor-tracker?replicaSet=rs0`. A local standalone MongoDB still runs the app; count updates then run without a transaction, and `npm run recount` is the repair.

## System Architecture

```
Browser / Next.js rewrite
        |  httpOnly cookies
        v
Express /api/v1
  request id, helmet, CORS allow-list, cookies, JSON, mongo-sanitize
  routes -> controllers -> services -> Mongoose models
        |
        v
MongoDB: users, doctors, patients
```

Login checks bcrypt, then sets `accessToken` (15 minutes) and `refreshToken` (7 days). Refresh checks the signed token, its stored hash, and `tokenVersion`. Logout increments `tokenVersion` and clears both cookies. Every route except health, login, and refresh requires an admin access token.

Doctor and patient lists validate the query, then run `find` and `countDocuments` together with `lean()` and a field projection. Search uses the text index. A phone-shaped patient search uses an anchored prefix on `{phone:1}`. Dashboard chart routes return `{ labels, values }`. Those reads, and `GET /meta/filters`, sit in a 60-second memory cache that doctor and patient writes clear.

`patientCount` changes with `$inc` in the same service call as the patient write. On a replica set that pair is one transaction. On a standalone node the writes are sequential.

## Technical Decisions

1. **Denormalized `patientCount` plus compound indexes.** The patients-per-doctor chart and the load sort read `doctor.patientCount` with `{patientCount:-1}`. That stays an index read instead of counting patients or using `$lookup`. The cost is keeping the counter aligned, which `$inc` and `npm run recount` do.

2. **httpOnly cookie JWTs.** The access token stays in a cookie the browser script cannot read. The frontend keeps filters in the URL and server data in TanStack Query, so this API does not accept `Authorization` headers or localStorage tokens.

## Visual Evidence

Screenshots belong to the frontend app. Placeholders:

- Desktop: `docs/screenshots/desktop.png`
- Mobile: `docs/screenshots/mobile.png`

## API Summary

Prefix: `/api/v1`. Success: `{ success: true, data, meta? }`. Error: `{ success: false, error: { code, message, details? } }`.

| Method | Path                               | Auth           | Purpose                                                                              |
| ------ | ---------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| GET    | `/health`                          | Public         | Liveness                                                                             |
| POST   | `/auth/login`                      | Public         | Set session cookies. 5 failures / 15 min per IP + email                              |
| POST   | `/auth/refresh`                    | Refresh cookie | New access cookie                                                                    |
| POST   | `/auth/logout`                     | Public         | Revoke refresh token and clear cookies                                               |
| GET    | `/auth/me`                         | Admin          | Current user                                                                         |
| GET    | `/doctors`                         | Admin          | `q`, `specialization`, `hospital`, `from`, `to`, `sort`, `order`, `page`, `limit`    |
| POST   | `/doctors`                         | Admin          | Create. 409 on duplicate email                                                       |
| GET    | `/doctors/:id`                     | Admin          | Profile                                                                              |
| PATCH  | `/doctors/:id`                     | Admin          | Partial update                                                                       |
| DELETE | `/doctors/:id`                     | Admin          | 409 while patients remain                                                            |
| GET    | `/doctors/:id/patients`            | Admin          | That doctor's patients                                                               |
| POST   | `/doctors/:id/patients`            | Admin          | Create patient and `$inc` count                                                      |
| DELETE | `/doctors/:id/patients/:patientId` | Admin          | Delete that patient and `$inc` count                                                 |
| GET    | `/patients`                        | Admin          | `q`, `condition`, `doctor`, `gender`, `from`, `to`, `sort`, `order`, `page`, `limit` |
| GET    | `/patients/:id`                    | Admin          | Profile                                                                              |
| PATCH  | `/patients/:id`                    | Admin          | Edit, including doctor reassignment                                                  |
| DELETE | `/patients/:id`                    | Admin          | Delete and `$inc` count                                                              |
| GET    | `/meta/filters`                    | Admin          | Distinct specializations, hospitals, conditions                                      |
| GET    | `/dashboard/summary`               | Admin          | KPIs plus 5 latest doctors and patients                                              |
| GET    | `/dashboard/patients-per-doctor`   | Admin          | `{ labels, values }` from `patientCount`                                             |
| GET    | `/dashboard/timeseries`            | Admin          | `range=7d\|30d\|90d\|12m`, optional `interval=day\|week\|month`                      |
| GET    | `/dashboard/conditions`            | Admin          | Top N plus `Other`                                                                   |
| GET    | `/dashboard/specializations`       | Admin          | Doctors grouped by specialization                                                    |

List defaults are page 1 and limit 10. Limit cannot exceed 50. Dates are UTC; `from` / `to` as `YYYY-MM-DD` include that whole day. Doctor `from`/`to` filter `createdAt`. Patient `from`/`to` filter `registeredAt`.

### Indexes each list uses

| Query                                   | Index                                              |
| --------------------------------------- | -------------------------------------------------- |
| Doctors, default or `sort=createdAt`    | `{createdAt:-1}`                                   |
| Doctors `specialization` + `createdAt`  | `{specialization:1, createdAt:-1}`                 |
| Doctors `hospital` + `createdAt`        | `{hospital:1, createdAt:-1}`                       |
| Doctors `sort=patientCount`             | `{patientCount:-1}`                                |
| Doctors `sort=name`                     | `{name:1}` (added so name sort is not a scan)      |
| Doctors `q`                             | text `{name, specialization, hospital}`            |
| Patients for one doctor, `registeredAt` | `{doctor:1, registeredAt:-1}`                      |
| Patients `condition` + `registeredAt`   | `{condition:1, registeredAt:-1}`                   |
| Patients date range                     | `{registeredAt:-1}`                                |
| Patients `gender` + `registeredAt`      | `{gender:1, registeredAt:-1}` (added for PAT-4)    |
| Patients phone-shaped `q`               | `{phone:1}` anchored prefix (added for PAT-3)      |
| Patients name/condition `q`             | text `{name, condition}`                           |
| Patients `sort=name`                    | `{name:1}`                                         |
| Patients per doctor chart               | `{patientCount:-1}`                                |
| Timeseries                              | `$match` on `{registeredAt:-1}`, then `$dateTrunc` |
| Condition donut                         | `$match` `{condition:{$gte:''}}` on `{condition:1, registeredAt:-1}`, then `$group` |
| Specialization chart                    | `$match` `{specialization:{$gte:''}}` on `{specialization:1, createdAt:-1}`, then `$group` |

`npm run explain` prints the winning plan against the database you have seeded. `npm test` fails a plan that is a `COLLSCAN`.

### Dashboard pipelines

Patients per doctor is a find, not an aggregation:

```js
Doctor.find({ patientCount: { $gt: 0 } })
  .sort({ patientCount: -1 })
  .limit(limit);
```

Timeseries (`range` chooses the window; `7d`/`30d` default to day, `90d` to week, `12m` to month):

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
];
```

Missing buckets are filled in the service so the chart has no gaps.

Conditions:

```js
[
  { $match: { condition: { $gte: '' } } },
  { $group: { _id: '$condition', count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
];
```

The handler keeps `limit` rows and sums the rest as `Other`.

Specializations:

```js
[
  { $match: { specialization: { $gte: '' } } },
  { $group: { _id: '$specialization', count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
  { $limit: 50 },
];
```

## Environment

| Variable              | Required  | Purpose                                                            |
| --------------------- | --------- | ------------------------------------------------------------------ |
| `NODE_ENV`            | No        | `development`, `test`, or `production`. Default `development`      |
| `PORT`                | No        | HTTP port. Default `4000`                                          |
| `MONGODB_URI`         | Yes       | `mongodb://` or `mongodb+srv://`                                   |
| `CLIENT_ORIGIN`       | Yes       | Comma-separated browser origins for CORS credentials               |
| `JWT_ACCESS_SECRET`   | Yes       | Access token secret, at least 32 characters                        |
| `JWT_REFRESH_SECRET`  | Yes       | Refresh token secret, at least 32 characters                       |
| `COOKIE_HTTPONLY`     | No        | Default `true`                                                     |
| `COOKIE_SECURE`       | No        | Default `true` in production. Required when `COOKIE_SAMESITE=none` |
| `COOKIE_SAMESITE`     | No        | `lax`, `strict`, or `none`. Default `lax`                          |
| `SEED_ADMIN_NAME`     | Seed only | Default `Admin`                                                    |
| `SEED_ADMIN_EMAIL`    | Seed only | Admin email                                                        |
| `SEED_ADMIN_PASSWORD` | Seed only | At least 8 characters                                              |

## Not in this repo

The Next.js admin UI owns login redirects, debounce, confirm dialogs, charts, responsive layout, Lighthouse, and screenshots (UX-1..5, NFR-6, and the UI half of AUTH-5, DOC-3, DOC-6, DOC-8, PAT-6, DASH-1..6). KPI sparklines and period deltas are derived on the client from `/dashboard/timeseries`. This API returns the four KPI numbers.
