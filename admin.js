const fields = {
  occupancy: document.querySelector("#occupancyInput"),
  teeTimes: document.querySelector("#teeTimesInput"),
  roundDate: document.querySelector("#roundDateInput"),
  roundTime: document.querySelector("#roundTimeInput"),
  roundCountdown: document.querySelector("#roundCountdownInput"),
  status: document.querySelector("#adminStatus"),
  save: document.querySelector("#saveOverrideButton"),
};

async function loadOverride() {
  const response = await fetch("/api/override", { cache: "no-store" });
  const data = await response.json();
  fields.occupancy.value = data.occupancy ?? 60;
  fields.teeTimes.value = (data.teeTimes || []).join(", ");
  fields.roundDate.value = data.nextRound?.date || "";
  fields.roundTime.value = data.nextRound?.time || "";
  fields.roundCountdown.value = data.nextRound?.countdown || "";
}

async function saveOverride() {
  const payload = {
    occupancy: Number(fields.occupancy.value),
    teeTimes: fields.teeTimes.value.split(",").map((time) => time.trim()).filter(Boolean),
    nextRound: {
      date: fields.roundDate.value.trim(),
      time: fields.roundTime.value.trim(),
      countdown: fields.roundCountdown.value.trim(),
    },
  };

  const response = await fetch("/api/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  fields.status.textContent = result.ok ? "Gespeichert. Dashboard aktualisiert sich beim naechsten Refresh." : result.error;
}

fields.save.addEventListener("click", saveOverride);
loadOverride();
