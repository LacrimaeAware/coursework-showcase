/*
 * Programming Assignment 6
 * Soda Sales Program
 */

import java.util.Scanner;

class SodaSales {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);

        String[] sodaFlavors = new String[6];
        int[] casesSold = new int[6];

        for (int i = 0; i < 6; i++) {
            System.out.print("Enter soda flavor " + (i + 1) + ": ");
            sodaFlavors[i] = input.nextLine();

            System.out.print("Enter number of cases sold for " + sodaFlavors[i] + ": ");
            casesSold[i] = Integer.parseInt(input.nextLine());
            System.out.println();
        }

        int totalCases = 0;
        int highestSold = 0;
        String topSeller = "";

        System.out.println("Soda Sales Report");
        System.out.println("-----------------");

        for (int i = 0; i < 6; i++) {
            System.out.println(sodaFlavors[i] + ": " + casesSold[i] + " cases");
            totalCases += casesSold[i];
            if (casesSold[i] > highestSold) {
                highestSold = casesSold[i];
                topSeller = sodaFlavors[i];
            }
        }

        System.out.println();
        System.out.println("Total cases sold: " + totalCases);
        System.out.println("Top-selling flavor: " + topSeller);

        input.close();
    }
}
