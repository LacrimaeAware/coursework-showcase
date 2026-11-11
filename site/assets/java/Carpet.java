package carpet;

public class Carpet {

    // Vars
    private Rectangle rectangle;
    private double pricePerSqYd;

    // Default Constructor
    public Carpet() {
        rectangle = new Rectangle();
        pricePerSqYd = 0.0;
    }

    // Set
    public void setDimensions(double length, double width) {
        rectangle.setLength(length);
        rectangle.setWidth(width);
    }
    public void setPricePerYd(double pricePerSqYd) {
        this.pricePerSqYd = pricePerSqYd;
    }

    // Get
    public Rectangle get_Rectangle() {
        return rectangle;
    }
    public double get_PricePerSqYd() {
        return pricePerSqYd;
    }

    // Method
    public double getTotalPrice() {
        return rectangle.getArea() * pricePerSqYd;
    }
}
