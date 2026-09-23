import { db } from "./firebase-config.js";
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let allBooks = [];

document.addEventListener("DOMContentLoaded", () => {
    loadPublicCatalog();

    const searchInput = document.getElementById("book-search");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            filterAndRenderCatalog(e.target.value);
        });
    }
});

async function loadPublicCatalog() {
    const catalogContainer = document.getElementById('book-catalog');
    if (!catalogContainer) return;

    catalogContainer.innerHTML = '<p class="loading-text">Consulting the arcane archives...</p>';
    
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, "books"));
        
        if (!snapshot.exists()) {
            catalogContainer.innerHTML = '<p class="loading-text">No tomes found within the archives.</p>';
            return;
        }

        allBooks = [];
        snapshot.forEach((childSnap) => {
            allBooks.push({ id: childSnap.key, ...childSnap.val() });
        });

        // Sort alphabetically by title
        allBooks.sort((a, b) => a.title.localeCompare(b.title));
        filterAndRenderCatalog("");

    } catch (err) {
        catalogContainer.innerHTML = `<p class="error-message">Error consulting archives: ${err.message}</p>`;
    }
}

function filterAndRenderCatalog(query) {
    const catalogContainer = document.getElementById('book-catalog');
    if (!catalogContainer) return;

    const searchTerm = query.toLowerCase().trim();
    const filtered = allBooks.filter(book => book.title.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        catalogContainer.innerHTML = '<p class="loading-text">No matching tomes discovered in the archives.</p>';
        return;
    }

    let availableList = [];
    let rentedOutList = [];
    let unavailableList = [];

    // Group items into their respective inventory states
    filtered.forEach(book => {
        if (book.totalStock === 0) {
            unavailableList.push(book); // Truly out of stock / not owned -> moved to bottom
        } else if (book.availableStock > 0) {
            availableList.push(book); // Available for rental
        } else {
            rentedOutList.push(book); // In stock, but all copies currently checked out
        }
    });

    catalogContainer.innerHTML = '';

    // 1. Available Books First
    availableList.forEach(book => {
        catalogContainer.innerHTML += `
            <div class="book-card available">
                <div>
                    <h3>📖 ${book.title}</h3>
                </div>
                <div>
                    <span class="status-badge status-available">Available for rental (${book.availableStock} / ${book.totalStock})</span>
                </div>
            </div>
        `;
    });

    // 2. In Stock, But All Copies Rented Out
    rentedOutList.forEach(book => {
        catalogContainer.innerHTML += `
            <div class="book-card unavailable">
                <div>
                    <h3>📖 ${book.title}</h3>
                </div>
                <div>
                    <span class="status-badge status-unavailable">All copies currently checked out (0 / ${book.totalStock})</span>
                </div>
            </div>
        `;
    });

    // 3. Unavailable / Not In Stock At All (Moved to the bottom)
    unavailableList.forEach(book => {
        catalogContainer.innerHTML += `
            <div class="book-card out-of-stock">
                <div>
                    <h3>📖 ${book.title}</h3>
                </div>
                <div>
                    <span class="status-badge status-out">Unavailable</span>
                </div>
            </div>
        `;
    });
}