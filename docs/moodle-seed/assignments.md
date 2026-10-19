# Moodle seed: three assignments for course "Test"

Create each with Add an activity or resource → Assignment. Leave submission types at the default
(online text + file). Set "Due date" and enable it; keep "Allow submissions from" as is.
Times are Asia/Almaty (UTC+5).

---

## 1. Assignment 3 — Authentication
**Due date:** 23 October 2026, 23:59

**Description:**
Extend your Assignment 2 REST service with authentication.
Requirements:
1. Implement JWT-based login that returns a signed access token.
2. Secure the /api/orders and /api/users endpoints; /api/products stays public.
3. Add role-based authorization with STUDENT and ADMIN roles. Only ADMIN may delete users.
4. Expire access tokens after 15 minutes and provide a refresh endpoint.
5. Store BCrypt-hashed passwords in the existing User entity.
6. Document the login and refresh workflow in the README with a sequence diagram.
Estimated effort: about 8 hours.

---

## 2. Lab 5 — Process Scheduling
**Due date:** 26 October 2026, 23:59

**Description:**
Implement a round-robin scheduler with a configurable time quantum passed through argv, then
compare it with FCFS and SJF on three workloads.
Requirements:
1. Reuse the PCB struct from Lab 4.
2. Simulate at least three workloads of 10 processes each.
3. Report average waiting time and turnaround time in a table.
4. Explain in one paragraph which algorithm wins for each workload and why.
Estimated effort: about 4 hours.

---

## 3. Research Methods Report — Literature Review
**Due date:** 30 October 2026, 23:59

**Description:**
Write a two-page literature review on remote learning engagement.
Requirements:
1. Use at least 8 peer-reviewed sources (Scopus or Google Scholar).
2. Follow APA 7 for citations and the reference list.
3. Structure: introduction, method of search, findings, gaps, conclusion.
4. Submit as a PDF or DOCX file.
Estimated effort: about 3.5 hours.
