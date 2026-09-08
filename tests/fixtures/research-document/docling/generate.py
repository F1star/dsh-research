"""Generate a scientific page with known values, then remove its text layer."""
from pathlib import Path
import io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import pypdfium2 as pdfium

p = Path(__file__).parent
c = canvas.Canvas(str(p / "scientific-native.pdf"), pagesize=(612, 792))
c.setTitle("Synthetic scientific extraction benchmark")
c.setFont("Helvetica-Bold", 19)
c.drawString(45, 747, "Controlled scientific extraction sample")
c.setFont("Helvetica", 11)
for y, s in [(721, "Synthetic data for parser verification; not an empirical research result."),
             (687, "1. Evaluation protocol"),
             (667, "We evaluate on the held-out Test split with 200 examples per method."),
             (650, "Accuracy is reported in percent. Uncertainty denotes standard deviation."),
             (622, "Table 1. Accuracy on the Test split over three independent runs.")]:
    c.drawString(45, y, s)
xs = [45, 210, 342, 475, 567]
ys = [606, 580, 554, 528]
for y in ys:
    c.line(xs[0], y, xs[-1], y)
for x in xs:
    c.line(x, ys[-1], x, ys[0])
rows = [["Method", "Split", "Accuracy (%)", "SD"],
        ["Baseline A", "Test", "80.0", "1.2"],
        ["Method B", "Test", "85.5", "0.8"]]
for i, row in enumerate(rows):
    c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 11)
    for x, s in zip(xs, row):
        c.drawString(x + 6, ys[i] - 18, s)
c.setFont("Helvetica", 10)
c.drawString(45, 511, "Note: SD is measured across runs, not a confidence interval.")
fig, ax = plt.subplots(figsize=(6.4, 2.4), dpi=180)
ax.plot([1, 2, 3], [70, 75, 80], marker="o", label="Baseline A")
ax.plot([1, 2, 3], [72, 80, 85.5], marker="s", label="Method B")
ax.set_xticks([1, 2, 3])
ax.set_xlabel("Training epochs")
ax.set_ylabel("Accuracy (%)")
ax.set_ylim(65, 90)
ax.legend(loc="lower right")
ax.grid(alpha=.2)
fig.tight_layout()
b = io.BytesIO()
fig.savefig(b, format="png")
plt.close(fig)
b.seek(0)
c.drawImage(ImageReader(b), 45, 282, width=522, height=196)
c.setFont("Helvetica", 10)
c.drawString(45, 268, "Figure 1. Test accuracy at three training epochs. Points are means.")
c.setFont("Helvetica", 11)
c.drawString(45, 232, "2. Accuracy definition")
fig = plt.figure(figsize=(6, .65), dpi=200)
fig.text(.04, .25, r"$A = \frac{100}{N}\sum_{i=1}^{N}\mathbf{1}(\hat{y}_i=y_i)$", fontsize=22)
b = io.BytesIO()
fig.savefig(b, format="png", bbox_inches="tight")
plt.close(fig)
b.seek(0)
c.drawImage(ImageReader(b), 45, 172, width=360, height=48, mask="auto")
c.drawString(45, 144, "Here N is the number of test examples; y is the reference label.")
c.drawString(45, 127, "The indicator is 1 for a correct predicted label and 0 otherwise.")
c.setFont("Helvetica", 9)
c.drawString(45, 40, "Synthetic fixture | page 1")
c.save()
with pdfium.PdfDocument(p / "scientific-native.pdf") as doc:
    page = doc[0]
    bitmap = page.render(scale=2.5)
    bitmap.to_pil().save(p / "scientific-scan.png")
    bitmap.close()
    page.close()
c = canvas.Canvas(str(p / "scientific-scan.pdf"), pagesize=(612, 792))
c.drawImage(str(p / "scientific-scan.png"), 0, 0, width=612, height=792)
c.save()
print(p / "scientific-scan.pdf")
