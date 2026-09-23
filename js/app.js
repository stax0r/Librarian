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

    catalogContainer.innerHTML = '<p class="loading-text">Loading library records...</p>';
    
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, "books"));
        
        if (!snapshot.exists()) {
            catalogContainer.innerHTML = '<p class="loading-text">No books found in the library archive.</p>';
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
        catalogContainer.innerHTML = `<p class="error-message">Error loading catalog: ${err.message}</p>`;
    }
}

function filterAndRenderCatalog(query) {
    const catalogContainer = document.getElementById('book-catalog');
    if (!catalogContainer) return;

    const searchTerm = query.toLowerCase().trim();
    const filtered = allBooks.filter(book => book.title.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        catalogContainer.innerHTML = '<p class="loading-text">No matching books found.</p>';
        return;
    }

    catalogContainer.innerHTML = '';

    filtered.forEach(book => {
        let cardClass = '';
        let badgeClass = '';
        let statusText = '';

        if (book.totalStock === 0) {
            // State 3: Greyed out / Out of stock (not owned)
            cardClass = 'out-of-stock';
            badgeClass = 'status-out';
            statusText = 'Out of Stock';
        } else if (book.availableStock > 0) {
            // State 1: Available for rental
            cardClass = 'available';
            badgeClass = 'status-available';
            statusText = `Available for Rental (${book.availableStock} / ${book.totalStock})`;
        } else {
            // State 2: Unavailable (every copy is rented)
            cardClass = 'unavailable';
            badgeClass = 'status-unavailable';
            statusText = `Rented Out (0 / ${book.totalStock})`;
        }

        catalogContainer.innerHTML += `
            <div class="book-card ${cardClass}">
                <div>
                    <h3>${book.title}</h3>
                </div>
                <div>
                    <span class="status-badge ${badgeClass}">${statusText}</span>
                </div>
            </div>
        `;
    });
}