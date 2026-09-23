import { auth, db } from "./firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, push, get, child, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const OVERDUE_LIMIT_DAYS = 7;

function checkIsOverdue(checkoutDateString) {
    const checkoutDate = new Date(checkoutDateString);
    const today = new Date();
    const diffTime = Math.abs(today - checkoutDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) > OVERDUE_LIMIT_DAYS;
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        loadDashboardData();
        loadAdminInventory();
        loadDropdowns();
    }
});

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'index.html';
    });
}

// Register Member
const memberForm = document.getElementById('add-member-form');
if (memberForm) {
    memberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('member-name').value;
        try {
            const newMemberRef = push(ref(db, 'members'));
            await set(newMemberRef, { name });
            alert("Character registered successfully!");
            document.getElementById('member-name').value = '';
            loadDropdowns();
        } catch (err) {
            alert("Error adding member: " + err.message);
        }
    });
}

// Add Book
const bookForm = document.getElementById('add-book-form');
if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('book-title').value;
        const totalStock = parseInt(document.getElementById('book-stock').value);
        try {
            const newBookRef = push(ref(db, 'books'));
            await set(newBookRef, {
                title,
                totalStock,
                availableStock: totalStock
            });
            alert("Book added to inventory!");
            document.getElementById('book-title').value = '';
            document.getElementById('book-stock').value = '1';
            loadAdminInventory();
            loadDropdowns();
        } catch (err) {
            alert("Error adding book: " + err.message);
        }
    });
}

// Populate Checkout Dropdowns
async function loadDropdowns() {
    const bookSelect = document.getElementById('checkout-book-select');
    const memberSelect = document.getElementById('checkout-member-select');
    if (!bookSelect || !memberSelect) return;

    bookSelect.innerHTML = '<option value="">Select Book...</option>';
    memberSelect.innerHTML = '<option value="">Select Character...</option>';

    const dbRef = ref(db);

    // Load available books with stock > 0
    const booksSnap = await get(child(dbRef, "books"));
    if (booksSnap.exists()) {
        booksSnap.forEach((childSnap) => {
            const book = childSnap.val();
            if (book.availableStock > 0) {
                bookSelect.innerHTML += `<option value="${childSnap.key}" data-title="${book.title}" data-stock="${book.availableStock}">${book.title} (Available: ${book.availableStock})</option>`;
            }
        });
    }

    // Load members
    const membersSnap = await get(child(dbRef, "members"));
    if (membersSnap.exists()) {
        membersSnap.forEach((childSnap) => {
            const member = childSnap.val();
            memberSelect.innerHTML += `<option value="${member.name}">${member.name}</option>`;
        });
    }
}

// Handle Checkout Form Submission
const checkoutForm = document.getElementById('checkout-form');
if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bookSelect = document.getElementById('checkout-book-select');
        const selectedOption = bookSelect.options[bookSelect.selectedIndex];
        
        const bookId = bookSelect.value;
        const bookTitle = selectedOption.getAttribute('data-title');
        const currentStock = parseInt(selectedOption.getAttribute('data-stock'));
        const memberName = document.getElementById('checkout-member-select').value;

        if (!bookId || !memberName) {
            alert("Please select both a book and a character.");
            return;
        }

        try {
            // 1. Create rental record with today's date
            const newRentalRef = push(ref(db, 'rentals'));
            await set(newRentalRef, {
                bookId,
                bookTitle,
                memberName,
                checkoutDate: new Date().toISOString()
            });

            // 2. Decrement available stock on the book
            await update(ref(db, `books/${bookId}`), {
                availableStock: currentStock - 1
            });

            alert(`Successfully rented "${bookTitle}" to ${memberName}!`);
            checkoutForm.reset();
            loadAdminInventory();
            loadDashboardData();
            loadDropdowns();
        } catch (err) {
            alert("Error processing checkout: " + err.message);
        }
    });
}

// Load Admin Inventory View
async function loadAdminInventory() {
    const inventoryList = document.getElementById('admin-inventory-list');
    if (!inventoryList) return;

    inventoryList.innerHTML = '<p class="loading-text">Loading inventory stock...</p>';

    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, "books"));

        if (!snapshot.exists()) {
            inventoryList.innerHTML = '<p>No books currently in stock.</p>';
            return;
        }

        inventoryList.innerHTML = '';
        snapshot.forEach((childSnap) => {
            const book = childSnap.val();
            inventoryList.innerHTML += `
                <div class="rental-item" style="display: flex; justify-content: space-between; align-items: center;">
                    <span><strong>${book.title}</strong></span>
                    <span>Available: <strong>${book.availableStock}</strong> / Total: ${book.totalStock}</span>
                </div>
            `;
        });
    } catch (err) {
        inventoryList.innerHTML = `<p class="error-message">Error loading inventory: ${err.message}</p>`;
    }
}

// Load Rentals & Overdue Check
async function loadDashboardData() {
    const rentalsList = document.getElementById('rentals-list');
    if (!rentalsList) return;

    rentalsList.innerHTML = '<p class="loading-text">Loading ledger records...</p>';
    
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, "rentals"));
        
        if (!snapshot.exists()) {
            rentalsList.innerHTML = '<p>No active rentals recorded in the ledger.</p>';
            return;
        }

        rentalsList.innerHTML = '';
        snapshot.forEach((childSnap) => {
            const rental = childSnap.val();
            const isOverdue = rental.checkoutDate ? checkIsOverdue(rental.checkoutDate) : false;
            
            rentalsList.innerHTML += `
                <div class="rental-item ${isOverdue ? 'overdue-warning' : ''}">
                    <p><strong>Book:</strong> ${rental.bookTitle || rental.bookId} | <strong>Borrower:</strong> ${rental.memberName}</p>
                    ${isOverdue ? '<span class="badge-warning">⚠️ OVERDUE WARNING (> ' + OVERDUE_LIMIT_DAYS + ' days)</span>' : ''}
                </div>
            `;
        });
    } catch (err) {
        rentalsList.innerHTML = `<p class="error-message">Error loading rentals: ${err.message}</p>`;
    }
}