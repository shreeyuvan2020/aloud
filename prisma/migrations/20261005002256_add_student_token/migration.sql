/*
  Warnings:

  - Added the required column `studentToken` to the `Assignment` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "prompt" TEXT,
    "essayText" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "questions" TEXT NOT NULL,
    "teacherToken" TEXT NOT NULL,
    "studentToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Assignment" ("analysis", "createdAt", "essayText", "id", "prompt", "questions", "teacherToken", "title") SELECT "analysis", "createdAt", "essayText", "id", "prompt", "questions", "teacherToken", "title" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE UNIQUE INDEX "Assignment_teacherToken_key" ON "Assignment"("teacherToken");
CREATE UNIQUE INDEX "Assignment_studentToken_key" ON "Assignment"("studentToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
