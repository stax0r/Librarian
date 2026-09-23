import { db } from "./firebase-config.js";
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

document.addEventListener("DOMContentLoaded", () => {
    loadPublicCatalog();
});

async function loadPublicCatalog() {
    const catalogContainer = document.getElementById('book-catalog');
    if (!catalogContainer) return;

    catalogContainer.innerHTML = '';
    
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, "books"));
        
        if (!snapshot.exists()) {
            catalogContainer.innerHTML = '<p class="loading-text">No books found in the library archive.</p>';
            return;
        }

        let availableBooks = [];
        let unavailableBooks = [];

        snapshot.forEach((childSnap) => {
            const book = { id: childSnap.key, ...childSnap.val() };
            if (book.availableStock > 0) {
                availableBooks.push(book);
            } else {
                unavailableBooks.push(book);
            }
        });

        // Sort alphabetically by title
        availableBooks.sort((a, b) => a.title.localeCompare(b.title));
        unavailableBooks.sort((a, b) => a.title.localeCompare(b.title));

        availableBooks.forEach(book => {
            catalogContainer.innerHTML += `
                <div class="book-card available">
                    <h3>${book.title}</h3>
                    <p>Available: ${book.availableStock} / ${book.totalStock}</p>
                </div>
            `;
        });

        unavailableBooks.forEach(book => {
            catalogContainer.innerHTML += `
                <div class="book-card unavailable greyed-out">
                    <h3>${book.title}</h3>
                    <p>Status: Rented Out</p>
                </div>
            `;
        });
    } catch (err) {
        catalogContainer.innerHTML = `<p class="error-message">Error loading catalog: ${err.message}</p>`;
    }
}