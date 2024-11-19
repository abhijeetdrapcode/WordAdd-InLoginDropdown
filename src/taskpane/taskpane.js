let categoryData = {
  closing: [],
  postClosing: [],
  representation: [],
};
let allParagraphsData = [];
let isDataLoaded = false;

//login variable
let isLoggedIn = false;
let authToken = localStorage.getItem("authToken");
//login variable

const dealSelect = document.getElementById("dealSelect");
const sendDealButton = document.getElementById("sendDealButton");

let documentContentHash = "";
let documentParagraphsState = [];
Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    const logStyleContentButton = document.getElementById("logStyleContentButton");
    const categorySelect = document.getElementById("categorySelect");
    const reloadButton = document.getElementById("reloadButton");
    const dismissButton = document.getElementById("dismissNotification");

    //dropdown after login
    const dealOptions = document.getElementById("dealOptions");

    //dropdown after login

    logStyleContentButton.disabled = true;
    logStyleContentButton.onclick = getListInfoFromSelection;
    document.getElementById("clearContentButton").onclick = clearCurrentContent;
    reloadButton.onclick = handleReloadContent;
    if (dismissButton) {
      dismissButton.onclick = dismissChangeNotification;
    }

    categorySelect.onchange = handleCategoryChange;
    handleCategoryChange();

    setInitialContentHash();
    setInterval(checkForDocumentChanges, 2000);

    loadAllParagraphsData();

    //Login

    const loginButton = document.getElementById("loginButton");
    const loginModal = document.getElementById("loginModal");
    const loginForm = document.getElementById("loginForm");
    const closeModal = document.querySelector(".close-modal");
    const loginError = document.getElementById("loginError");

    // Check initial login status
    if (authToken) {
      isLoggedIn = true;
      loginButton.textContent = "Logout";
    }

    // Login button click handler
    loginButton.addEventListener("click", () => {
      if (!isLoggedIn) {
        loginModal.style.display = "block";
      } else {
        // Handle logout
        isLoggedIn = false;
        authToken = null;
        localStorage.removeItem("authToken");
        loginButton.textContent = "Login To Deal Driver";
        dealOptions.style.display = "none";
      }
    });

    // Close modal handlers
    closeModal.addEventListener("click", () => {
      loginModal.style.display = "none";
      loginError.style.display = "none";
    });

    window.addEventListener("click", (event) => {
      if (event.target === loginModal) {
        loginModal.style.display = "none";
        loginError.style.display = "none";
      }
    });

    // Login form submission handler
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const userName = document.getElementById("userName").value;
      const password = document.getElementById("password").value;

      const loginSuccess = await handleLogin(userName, password);
      if (loginSuccess) {
        isLoggedIn = true;
        loginButton.textContent = "Logout";
        loginModal.style.display = "none";
        loginError.style.display = "none";
        loginForm.reset();

        // Show the deal options dropdown and button
        dealOptions.style.display = "block";
      } else {
        loginError.style.display = "block";
      }
    });
    //Login
  }
});
async function setInitialContentHash() {
  try {
    await Word.run(async (context) => {
      const body = context.document.body;
      body.load("text");
      await context.sync();
      documentContentHash = await calculateHash(body.text);
    });
  } catch (error) {
    console.error("Error setting initial content hash:", error);
  }
}

function dismissChangeNotification() {
  const changeNotification = document.getElementById("changeNotification");
  if (changeNotification) {
    changeNotification.style.display = "none";
  }
}
async function calculateHash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function checkForDocumentChanges() {
  try {
    await Word.run(async (context) => {
      const body = context.document.body;
      body.load("text");
      await context.sync();

      const currentHash = await calculateHash(body.text);

      if (currentHash !== documentContentHash) {
        documentContentHash = currentHash;
        const changeNotification = document.getElementById("changeNotification");
        if (changeNotification) {
          changeNotification.style.display = "block";
        }
      }
    });
  } catch (error) {
    console.error("Error checking for document changes:", error);
  }
}
async function handleReloadContent() {
  const changeNotification = document.getElementById("changeNotification");
  if (changeNotification) {
    changeNotification.style.display = "none";
  }
  await setInitialContentHash();
  await loadAllParagraphsData();
}

async function handleCategoryChange() {
  const categorySelect = document.getElementById("categorySelect");
  const selectedCategory = categorySelect.value;

  document.querySelectorAll(".category-content").forEach((section) => {
    section.classList.remove("active");
  });

  const contentId = `${selectedCategory}Content`;
  document.getElementById(contentId).classList.add("active");

  document.getElementById("logStyleContentButton").disabled = !isDataLoaded || !selectedCategory;

  if (selectedCategory && categoryData[selectedCategory]) {
    const clipboardString = formatCategoryData(selectedCategory);
    await silentCopyToClipboard(clipboardString);
  }
}

async function silentCopyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.log("Fallback: using execCommand for copy");
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    document.body.appendChild(textArea);

    try {
      textArea.select();
      document.execCommand("copy");
    } catch (err) {
      console.error("Failed to copy text:", err);
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

function normalizeText(text) {
  return text
    .trim()
    .replace(/^\.\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, "");
}

async function loadAllParagraphsData() {
  try {
    await Word.run(async (context) => {
      const body = context.document.body;
      const paragraphs = body.paragraphs;

      // Load all paragraph data in a batch
      paragraphs.load("items, items/text, items/isListItem");
      await context.sync();

      allParagraphsData = [];
      let parentNumbering = [];
      let lastNumbering = "";

      // Disable button and set loading state
      document.getElementById("logStyleContentButton").disabled = true;
      isDataLoaded = false;

      // Filter and prepare batch loading for list item details
      const listItems = paragraphs.items.filter((p) => p.isListItem);
      listItems.forEach((item) => item.listItem.load("level, listString"));
      await context.sync(); // Sync all list item data at once

      for (let i = 0; i < paragraphs.items.length; i++) {
        const paragraph = paragraphs.items[i];
        const text = normalizeText(paragraph.text);

        if (text.length <= 1) {
          continue; // Skip empty or single-character paragraphs
        }

        if (paragraph.isListItem) {
          const listItem = paragraph.listItem;
          const level = listItem.level;
          const listString = listItem.listString || "";

          // Update parent numbering based on level
          if (level <= parentNumbering.length) {
            parentNumbering = parentNumbering.slice(0, level);
          }
          parentNumbering[level] = listString;

          // Generate full numbering
          const fullNumbering = parentNumbering
            .slice(0, level + 1)
            .filter(Boolean)
            .join(".");
          lastNumbering = fullNumbering;

          allParagraphsData.push({
            key: fullNumbering,
            value: text,
            originalText: paragraph.text.trim().replace(/^\.\s*/, ""),
            isListItem: true,
            index: i,
            level: level,
            listString: listString,
            parentNumbers: [...parentNumbering],
          });
        } else {
          // For non-list items, create a unique key based on the last numbering
          const key = lastNumbering ? `${lastNumbering} (text)` : `text_${i + 1}`;
          allParagraphsData.push({
            key: key,
            value: text,
            originalText: paragraph.text.trim().replace(/^\.\s*/, ""),
            isListItem: false,
            index: i,
            level: -1,
          });
        }
      }

      // Remove unwanted keys ending with ".text"
      allParagraphsData = allParagraphsData.filter((item) => !item.key.endsWith(".text"));

      console.log("All paragraphs data loaded:", allParagraphsData);

      // Enable the log button only if a category is selected
      const categorySelect = document.getElementById("categorySelect");
      document.getElementById("logStyleContentButton").disabled = !categorySelect.value;
      isDataLoaded = true;
    });
  } catch (error) {
    console.error("An error occurred while loading all paragraphs data:", error);
    if (error instanceof OfficeExtension.Error) {
      console.error("Debug info:", error.debugInfo);
    }
    document.getElementById("logStyleContentButton").disabled = true;
    isDataLoaded = false;
  }
}

async function getListInfoFromSelection() {
  if (!isDataLoaded) {
    console.log("Data is still loading. Please wait.");
    return;
  }

  const selectedCategory = document.getElementById("categorySelect").value;
  if (!selectedCategory) {
    console.log("No category selected");
    return;
  }

  try {
    await Word.run(async (context) => {
      const selection = context.document.getSelection();
      const range = selection.getRange();
      range.load("text");
      await context.sync();

      const selectedRange = range.text;
      const paragraphs = selection.paragraphs;
      paragraphs.load("items");
      await context.sync();

      let newSelections = [];

      for (let i = 0; i < paragraphs.items.length; i++) {
        const selectedParagraph = paragraphs.items[i];
        selectedParagraph.load("text,isListItem");
        await context.sync();

        if (selectedParagraph.isListItem) {
          selectedParagraph.listItem.load("level,listString");
          await context.sync();
        }

        const selectedText = selectedParagraph.text.trim().replace(/^\.\s*/, "");
        const normalizedSelectedText = normalizeText(selectedText);

        const matchingParagraphs = allParagraphsData.filter(
          (para) => para.value === normalizedSelectedText || para.originalText === selectedText
        );

        if (matchingParagraphs.length > 0) {
          let bestMatch = matchingParagraphs[0];

          if (matchingParagraphs.length > 1 && selectedParagraph.isListItem) {
            const selectedLevel = selectedParagraph.listItem.level;
            const selectedListString = selectedParagraph.listItem.listString;

            const exactMatch = matchingParagraphs.find(
              (para) => para.isListItem && para.level === selectedLevel && para.listString === selectedListString
            );

            if (exactMatch) {
              bestMatch = exactMatch;
            }
          }

          const isDuplicate = categoryData[selectedCategory].some(
            (item) => item.key === bestMatch.key && item.value === bestMatch.value
          );

          if (!isDuplicate) {
            newSelections.push({
              key: bestMatch.key,
              value: bestMatch.value,
            });
          }
        }
      }

      if (newSelections.length > 0) {
        categoryData[selectedCategory] = [...categoryData[selectedCategory], ...newSelections];

        categoryData[selectedCategory].sort((a, b) => {
          const aNumbers = a.key.split(".").map((num) => parseInt(num));
          const bNumbers = b.key.split(".").map((num) => parseInt(num));

          for (let i = 0; i < Math.max(aNumbers.length, bNumbers.length); i++) {
            if (isNaN(aNumbers[i])) return 1;
            if (isNaN(bNumbers[i])) return -1;
            if (aNumbers[i] !== bNumbers[i]) return aNumbers[i] - bNumbers[i];
          }
          return 0;
        });

        updateCategoryDisplay(selectedCategory);
        const clipboardString = formatCategoryData(selectedCategory);
        await copyToClipboard(clipboardString);

        console.log(`Updated ${selectedCategory} data:`, categoryData[selectedCategory]);
      }
    });
  } catch (error) {
    console.error("An error occurred while processing selection:", error);
    if (error instanceof OfficeExtension.Error) {
      console.error("Debug info:", error.debugInfo);
    }
  }
}

function formatCategoryData(category) {
  if (!categoryData[category] || !Array.isArray(categoryData[category])) {
    console.error("Invalid category data for:", category);
    return "{}";
  }

  const pairs = categoryData[category].map((pair) => `"${pair.key}": "${pair.value.replace(/"/g, '\\"')}"`).join(",\n");

  return `{\n${pairs}\n}`;
}

function updateCategoryDisplay(category) {
  const contentElement = document.querySelector(`#${category}Content .content-area`);
  if (!contentElement) {
    console.error("Content element not found for category:", category);
    return;
  }

  contentElement.innerHTML = "";

  if (categoryData[category]) {
    categoryData[category].forEach((pair) => {
      const keySpan = `<span class="key">${pair.key}</span>`;
      const valueSpan = `<span class="value">${pair.value}</span>`;
      const formattedPair = `<div class="pair">${keySpan}: ${valueSpan}</div>`;
      contentElement.innerHTML += formattedPair;
    });
  }
}

async function copyToClipboard(text) {
  if (!text) {
    console.error("No text provided to copy");
    showCopyMessage(false);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showCopyMessage(true);
  } catch (err) {
    console.log("Fallback: using execCommand for copy");
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    document.body.appendChild(textArea);

    try {
      textArea.select();
      const successful = document.execCommand("copy");
      showCopyMessage(successful);
    } catch (err) {
      console.error("Failed to copy text:", err);
      showCopyMessage(false);
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

function showCopyMessage(successful) {
  const copyMessage = document.getElementById("copyMessage");
  if (!copyMessage) {
    console.error("Copy message element not found");
    return;
  }

  copyMessage.style.display = "block";
  copyMessage.textContent = successful ? "Content added and copied to clipboard!" : "Failed to copy content";
  copyMessage.style.color = successful ? "green" : "red";

  setTimeout(() => {
    copyMessage.style.display = "none";
  }, 3000);
}

async function clearCurrentContent() {
  const selectedCategory = document.getElementById("categorySelect").value;
  if (!selectedCategory) {
    console.log("No category selected");
    return;
  }

  categoryData[selectedCategory] = [];

  const contentElement = document.querySelector(`#${selectedCategory}Content .content-area`);
  if (contentElement) {
    contentElement.innerHTML = "";
  }

  const clipboardString = "{}";
  await silentCopyToClipboard(clipboardString);

  console.log(`Cleared content for category: ${selectedCategory}`);
}

//Login
async function handleLogin(userName, password) {
  try {
    const response = await fetch("https://deal-driver-20245869.drapcode.io/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userName,
        password,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("This is the API response data", data);

      // Save token to localStorage
      localStorage.setItem("authToken", data.token);

      // Extract deal names from the response
      const dealNames = data.userDetails?.deal_name || [];

      // Populate the dropdown
      const dealSelect = document.getElementById("dealSelect");
      dealSelect.innerHTML = ""; // Clear existing options

      dealNames.forEach((deal) => {
        const option = document.createElement("option");
        option.value = deal._id; // Use the deal ID as the value
        console.log("These are the option value ", option.value);
        option.textContent = deal.deal_name; // Display the deal name
        dealSelect.appendChild(option);
      });

      // Show the deal options section if deals exist
      if (dealNames.length > 0) {
        document.getElementById("dealOptions").style.display = "block";
      } else {
        document.getElementById("dealOptions").style.display = "none";
      }

      return true;
    } else {
      console.error("Login failed with status:", response.status);
      return false;
    }
  } catch (error) {
    console.error("Login error:", error);
    return false;
  }
}

//Api call for login
// async function ApiCall() {
//   if (!authToken) {
//     console.error("User not authenticated");
//     return;
//   }

//   try {
//     const response = await fetch("YOUR_API_ENDPOINT", {
//       headers: {
//         Authorization: `Bearer ${authToken}`,
//         "Content-Type": "application/json",
//       },
//       // ... rest of your fetch configuration
//     });
//     // ... rest of your API call logic
//   } catch (error) {
//     console.error("API call error:", error);
//   }
// }

// Select Deal
// sendDealButton.addEventListener("click", () => {
//   const selectedDeal = dealSelect.value;
//   alert("Data is being sent");
//   if (selectedDeal) {
//     console.log(`Sending data for: ${selectedDeal}`);
//     alert(`Deal "${selectedDeal}" sent successfully!`);
//   } else {
//     alert("Please select a deal before sending.");
//   }
// });

// document.addEventListener("DOMContentLoaded", () => {
//   const verifyTokenButton = document.getElementById("verifyTokenButton");

//   // Ensure the event listener is attached only once
//   if (!verifyTokenButton.hasListener) {
//     verifyTokenButton.addEventListener("click", async (event) => {
//       // Prevent default form submission if the button is inside a form
//       event.preventDefault();

//       const tokenInput = document.getElementById("tokenInput").value.trim();

//       if (!tokenInput) {
//         alert("Please enter a token to verify.");
//         return;
//       }

//       try {
//         const response = await fetch("https://deal-driver-20245869.drapcode.io/authorize-secret-code", {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           body: JSON.stringify({
//             verify_code: tokenInput,
//           }),
//         });

//         if (!response.ok) {
//           const errorData = await response.json();
//           alert(`Verification failed: ${errorData.message || "Unknown error"}`);
//           return;
//         }

//         const result = await response.json();
//         alert(`Token verified successfully: ${result.message || "Success!"}`);
//       } catch (error) {
//         console.error("Error verifying token:", error);
//         alert("An error occurred while verifying the token. Please try again.");
//       }
//     });

//     // Mark that the listener has been added
//     verifyTokenButton.hasListener = true;
//   }
// });
