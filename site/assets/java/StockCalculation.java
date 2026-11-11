/*
 * Programming Assignment 5
 * Calculating Stocks Program
 */

import java.util.Scanner;

class StockCalculation {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        String again = "y";

        while (again.equalsIgnoreCase("y")) {
            System.out.print("Number of Stock A shares bought? ");
            double num_shares = Double.parseDouble(scanner.nextLine());

            System.out.print("Purchase price of Stock A? ");
            double a_price = Double.parseDouble(scanner.nextLine());

            System.out.print("Sale price of Stock A? ");
            double a_sell = Double.parseDouble(scanner.nextLine());

            System.out.print("Purchase price of Stock B? ");
            double b_price = Double.parseDouble(scanner.nextLine());

            double total_paid = calcStockCost(num_shares, a_price);
            double total_sell = calcStockCost(num_shares, a_sell);
            double total_gained = total_sell - total_paid;
            double shares_to_buy = sharesStock(total_sell, b_price);

            System.out.println();
            System.out.println("Total amount paid for Stock A: $" + String.format("%.2f", total_paid));
            System.out.println("Total amount received from selling Stock A: $" + String.format("%.2f", total_sell));

            if (total_gained >= 0) {
                System.out.println("You gained: $" + String.format("%.2f", total_gained));
            } else {
                System.out.println("You lost: $" + String.format("%.2f", -total_gained));
            }

            System.out.println("Number of Stock B shares you can buy: " + String.format("%.1f", shares_to_buy));

            System.out.println();
            System.out.print("Would you like to enter another set? (y/n): ");
            again = scanner.nextLine();
            System.out.println();
        }

        System.out.println("Program ended.");
        scanner.close();
    }

    public static double calcStockCost(double numShares, double stockPrice) {
        double cost = numShares * stockPrice;
        cost = Math.round(cost * 100.0) / 100.0;
        return cost;
    }

    public static double sharesStock(double totalAmount, double stockPrice) {
        double shares = totalAmount / stockPrice;
        shares = Math.round(shares * 10.0) / 10.0;
        return shares;
    }
}
