const dot = document.getElementById("statusDot");
const text = document.getElementById("statusText");

chrome.runtime.sendMessage({ type: "getStatus" }, (response) => {
  if (chrome.runtime.lastError) {
    text.textContent = "Error";
    return;
  }
  if (response?.connected) {
    dot.classList.remove("disconnected");
    dot.classList.add("connected");
    text.textContent = "Connected";
  } else {
    dot.classList.remove("connected");
    dot.classList.add("disconnected");
    text.textContent = "Disconnected";
  }
});
