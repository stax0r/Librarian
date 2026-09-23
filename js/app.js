import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    loadPublicCatalog();
});

async function loadPublicCatalog() {
    const catalogContainer = document.getElementById('book-catalog');
    if (!catalogContainer) return;

    catalogContainer.innerHTML = '';
    
    try {
        const querySnapshot = await getDocs(collection(db, "books"));
        
        let availableBooks = [];
        let unavailableBooks = [];

        querySnapshot.forEach((docSnap) => {
            const book = { id: docSnap.id, ...docSnap.data() };
            if (book.availableStock > 0) {
                availableBooks.push(book);
            } else {
                unavailableBooks.push(book);
            }
        });

        if (availableBooks.length === 0 && unavailableBooks.length === 0) {
            catalogContainer.innerHTML = '<p class="loading-text">No books found in the library archive.</p>';
            return;
        }

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