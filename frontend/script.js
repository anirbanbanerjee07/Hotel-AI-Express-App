async function ask() {
  const output = document.getElementById("out");
  output.innerHTML = '<span class="loading">Loading...</span>';
  const question = document.getElementById("q").value;

  try {
    const res = await fetch("http://localhost:3000/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const data = await res.json();
    output.textContent = data.answer || JSON.stringify(data, null, 2);
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
}
