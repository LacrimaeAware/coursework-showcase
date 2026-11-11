"""Construct Koch snowflake stages and check their length and area."""

from pathlib import Path
from math import sqrt, log
import sys


def refine(points):
    """Replace each counterclockwise edge with four outward edges."""
    refined = []
    for a, b in zip(points, points[1:] + points[:1]):
        edge = b - a
        refined.extend((a, a + edge / 3,
                        a + edge / 2 - 1j * sqrt(3) * edge / 6,
                        a + 2 * edge / 3))
    return refined


def perimeter(points):
    return sum(abs(b - a) for a, b in zip(points, points[1:] + points[:1]))


def area(points):
    return abs(sum(a.real * b.imag - b.real * a.imag
                   for a, b in zip(points, points[1:] + points[:1]))) / 2


def stages():
    result = [[0j, 1 + 0j, .5 + 1j * sqrt(3) / 2]]
    for _ in range(4):
        result.append(refine(result[-1]))
    return result


def check_geometry(all_stages):
    initial_area = sqrt(3) / 4
    for n, points in enumerate(all_stages):
        expected_area = initial_area * (8 / 5 - 3 / 5 * (4 / 9) ** n)
        assert len(points) == 3 * 4 ** n
        assert abs(perimeter(points) - 3 * (4 / 3) ** n) < 1e-10
        assert abs(area(points) - expected_area) < 1e-10
    assert abs(log(4) / log(3) - 1.2618595071429148) < 1e-14


def draw_svg(all_stages):
    bounds = all_stages[3]
    xmin, xmax = min(p.real for p in bounds), max(p.real for p in bounds)
    ymin, ymax = min(p.imag for p in bounds), max(p.imag for p in bounds)
    scale = min(330 / (xmax - xmin), 240 / (ymax - ymin))
    center = complex((xmin + xmax) / 2, (ymin + ymax) / 2)
    elements = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="840" height="650" viewBox="0 0 840 650" role="img" aria-labelledby="title description">',
        '<title id="title">Koch snowflake refinements</title>',
        '<desc id="description">An equilateral triangle followed by three outward refinements. Each boundary segment is replaced by four segments of one third its length.</desc>',
        '<rect width="840" height="650" fill="#fbfaf6"/>',
    ]
    for n, points in enumerate(all_stages[:4]):
        col, row = n % 2, n // 2
        cx, cy = 210 + 420 * col, 175 + 320 * row
        coordinates = [(cx + (p.real - center.real) * scale,
                        cy - (p.imag - center.imag) * scale)
                       for p in points]
        path = "M " + " L ".join(f"{x:.4f},{y:.4f}" for x, y in coordinates) + " Z"
        elements.append(f'<text x="{cx}" y="{32 + 320 * row}" text-anchor="middle" fill="#202f2b" font-family="Arial, sans-serif" font-size="20">Stage {n}</text>')
        elements.append(f'<path d="{path}" fill="#dce9df" stroke="#22685f" stroke-width="2" stroke-linejoin="round"/>')
    elements.append('</svg>')
    return "\n".join(elements) + "\n"


if __name__ == "__main__":
    data = stages()
    check_geometry(data)
    if "--check" not in sys.argv:
        Path(__file__).with_name("koch-stages.svg").write_text(draw_svg(data), encoding="utf-8")
    print("PASS: stages 0-4 match segment-count, perimeter and area formulas.")
