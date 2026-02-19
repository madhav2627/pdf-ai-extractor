import os
from flask import Flask, render_template, request, send_file, jsonify
from utils.pdf_processor import extract_images_to_pdf

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputs"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    images_per_page = int(request.form.get("images_per_page", 1))

    if not file or not file.filename.endswith(".pdf"):
        return jsonify({"error": "Please upload a valid PDF"}), 400

    input_path = os.path.join(UPLOAD_FOLDER, file.filename)
    output_path = os.path.join(OUTPUT_FOLDER, f"images_{file.filename}")

    file.save(input_path)

    try:
        extract_images_to_pdf(input_path, output_path, images_per_page)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"download_url": f"/download/{os.path.basename(output_path)}"})


@app.route("/download/<filename>")
def download(filename):
    return send_file(os.path.join(OUTPUT_FOLDER, filename), as_attachment=True)


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
