# Moodle seed data

Test content for the `gdg-test` Moodle site so every MCP tool has something to return.

1. Log in to Moodle as admin and open the course **Test** (id 9). Click **Edit mode** on.
2. In a section (for example "New section" #1) choose **Add content → Activity or resource →
   Assignment** three times. Copy the name, description and due date of each assignment from
   [`assignments.md`](assignments.md), enable **Due date**, then **Save and return to course**.
3. Add the lecture notes: **Add content → Activity or resource → File**, name it
   `Lecture 6 — Security in Web APIs`, upload [`lecture_06_security_in_web_apis.txt`](lecture_06_security_in_web_apis.txt)
   (drag it into the file picker), then **Save and return to course**.
4. Make sure all four items are **visible** (eye icon not crossed out).

Check from the repo root:

```bash
python -m campuspulse_mcp    # then call moodle_list_assignments / moodle_list_course_files
```

Expected: 3 assignments with the due dates above, 1 file `lecture_06_security_in_web_apis.txt`
readable by `moodle_read_file`, and the assignments in `moodle_get_calendar_events`.
