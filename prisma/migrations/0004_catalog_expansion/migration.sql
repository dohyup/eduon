-- Widen existing categories without changing records or school-grade codes.
BEGIN;
ALTER TABLE "Course" DROP CONSTRAINT "course_fields_check";
ALTER TABLE "Course" ADD CONSTRAINT "course_fields_check" CHECK (
  "gradeMin" BETWEEN 1 AND 13 AND "gradeMax" BETWEEN "gradeMin" AND 13
  AND subject IN ('math','english','programming','ai_usage','ai_certificate','ai_agent')
  AND level IN ('beginner','intermediate','advanced')
);
ALTER TABLE "StudentProfile" DROP CONSTRAINT "student_grade_check";
ALTER TABLE "StudentProfile" ADD CONSTRAINT "student_grade_check" CHECK (grade BETWEEN 1 AND 13);
COMMIT;
