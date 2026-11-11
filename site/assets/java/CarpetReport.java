package carpet;

/*
 * Programming Discussion 5
 * Carpet Data
 */

import java.util.Scanner;

public class CarpetReport {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        // Vars
        Carpet[] carpets = new Carpet[5];
        int count = 0;
        boolean term = false;
        String flirt = "✦";

        // Intro
        System.out.println(flirt.repeat(15));

        // Loop
        while (!term) {
            Carpet carpet = new Carpet();

            System.out.print("Enter length: ");
            double length = Double.parseDouble(scanner.nextLine());
            System.out.print("Enter width: ");
            double width = Double.parseDouble(scanner.nextLine());
            carpet.setDimensions(length, width);

            System.out.print("Enter price per square yard: ");
            double price = Double.parseDouble(scanner.nextLine());
            carpet.setPricePerYd(price);

            carpets[count] = carpet;
            count = count + 1;

            System.out.print('\n');
            System.out.print("Do you wish to continue? [Y/N]: ");
            String response = scanner.nextLine();
            System.out.print('\n');

            term = (count == 5 || response.toLowerCase().startsWith("n"));
        }

        // Display
        for (int i = 0; i < count; i++) {
            System.out.print('\n');
            System.out.print("Length: " + carpets[i].get_Rectangle().getLength());
            System.out.print('\n');
            System.out.print("Width: " + carpets[i].get_Rectangle().getWidth());
            System.out.print('\n');
            System.out.print("Price per square yard: " + carpets[i].get_PricePerSqYd());
            System.out.print('\n');
            System.out.print("Total Price: " + carpets[i].getTotalPrice());
            System.out.print('\n');
        }

        // Outro
        System.out.print("\nTerminating...\n");
        System.out.println(flirt.repeat(15));
    }
}
