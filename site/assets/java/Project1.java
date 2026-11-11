/*
 * Project 1
 * School Registration Project
 */

import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.IOException;
import java.util.Scanner;

public class Project1 {

    public static void main(String[] args) {
        final String FILE_NAME = "cop2250_proj1.txt";
        Scanner in = new Scanner(System.in);

        // intro
        System.out.println("Student Registration -> writes to cop2250_proj1.txt");
        System.out.print("Start now? (Y/N): ");
        String start = in.nextLine().trim();
        if (!start.equalsIgnoreCase("Y")) {
            System.out.println("Exiting.");
            in.close();
            return;
        }

        // save & overwrite file
        try (PrintWriter out = new PrintWriter(new FileWriter(FILE_NAME, false))) {

            boolean keepGoing = true;
            while (keepGoing) {
                // student number (must be 6 digits)
                String stuNum;
                while (true) {
                    System.out.print("Enter 6-digit Student Number - ");
                    stuNum = in.nextLine().trim();
                    if (stuNum.matches("\\d{6}")) break;
                    System.out.println("Type 6 digit number.");
                }

                // names
                System.out.print("First Name: ");
                String first = in.nextLine().trim();
                System.out.print("Last Name: ");
                String last = in.nextLine().trim();

                // campus (menu)
                String campus = chooseCampus(in);

                // courses: 1..4, if fewer, fill with a single space
                String[] courses = {" ", " ", " ", " "};
                int cCount = 0;
                while (cCount < 4) {
                    System.out.print("Enter course (ex: COP 2250) - ");
                    String c = in.nextLine().trim();
                    if (c.isEmpty()) {
                        System.out.println("Need at least one course.");
                        continue;
                    }
                    courses[cCount] = c;
                    cCount++;

                    if (cCount == 4) break;
                    System.out.print("Add another course? (Y/N): ");
                    String moreC = in.nextLine().trim();
                    if (!moreC.equalsIgnoreCase("Y")) break;
                }

                // senior practicum Y/N
                String senior;
                while (true) {
                    System.out.print("Senior practicum? (Y/N): ");
                    senior = in.nextLine().trim().toUpperCase();
                    if (senior.equals("Y") || senior.equals("N")) break;
                    System.out.println("Please enter Y or N.");
                }

                // tuition
                int tuition = calcTuition(countEntered(courses), campus, senior);

                // semester menu
                String semester = chooseSemester(in);

                // Construct CSV
                StringBuilder sb = new StringBuilder();
                sb.append(stuNum).append(",")
                        .append(first).append(",")
                        .append(last).append(",")
                        .append(campus).append(",")
                        .append(courses[0]).append(",")
                        .append(courses[1]).append(",")
                        .append(courses[2]).append(",")
                        .append(courses[3]).append(",")
                        .append(senior).append(",")
                        .append(tuition).append(",")
                        .append(semester);

                out.println(sb.toString());

                // done with one student
                System.out.print("Add another student? (Y/N): ");
                String again = in.nextLine().trim();
                if (!again.equalsIgnoreCase("Y")) keepGoing = false;
            }

            System.out.println("Wrote data to " + FILE_NAME);
        } catch (IOException ex) {
            System.out.println("File error: " + ex.getMessage());
        }

        in.close();
        System.out.println("Goodbye.");
    }

    // campus menu
    private static String chooseCampus(Scanner in) {
        while (true) {
            System.out.println("Campus:");
            System.out.println("  1) City");
            System.out.println("  2) North");
            System.out.println("  3) South");
            System.out.println("  4) Seaside");
            System.out.print("Choose (1-4): ");
            String pick = in.nextLine().trim();
            if (pick.equals("1")) return "City";
            if (pick.equals("2")) return "North";
            if (pick.equals("3")) return "South";
            if (pick.equals("4")) return "Seaside";
            System.out.println("Invalid choice, try again.");
        }
    }

    // semester menu
    private static String chooseSemester(Scanner in) {
        while (true) {
            System.out.println("Semester:");
            System.out.println("  1) Fall");
            System.out.println("  2) Spring");
            System.out.println("  3) Summer");
            System.out.print("Choose (1-3): ");
            String pick = in.nextLine().trim();
            if (pick.equals("1")) return "Fall";
            if (pick.equals("2")) return "Spring";
            if (pick.equals("3")) return "Summer";
            System.out.println("Invalid choice, try again.");
        }
    }

    private static int countEntered(String[] arr) {
        int n = 0;
        for (String s : arr) if (!" ".equals(s)) n++;
        return n;
    }

    // tuition by campus + optional senior fee
    private static int calcTuition(int nCourses, String campus, String senior) {
        int perCourse;
        if ("City".equals(campus)) perCourse = 525;
        else if ("North".equals(campus)) perCourse = 510;
        else if ("South".equals(campus)) perCourse = 500;
        else if ("Seaside".equals(campus)) perCourse = 550;
        else perCourse = 0; // shouldn't happen

        int total = perCourse * nCourses;
        if ("Y".equals(senior)) total += 100;
        return total;
    }
}