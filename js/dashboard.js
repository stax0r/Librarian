import { auth, db } from "./firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, push, get, child, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Set default datetime-local value to 3 days from now
window.addEventListener('DOMContentLoaded', () => {
    const dueInput = document.getElementById('due-date-input');
    if (dueInput) {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 3);
        dueInput.value = defaultDate.toISOString().slice(0, 16);
    }
});

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
        const name = document.getElementById('member-name').value.trim();
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

// Add Book with Duplicate Name Check
const bookForm = document.getElementById('add-book-form');
if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titleInput = document.getElementById('book-title').value.trim();
        const totalStock = parseInt(document.getElementById('book-stock').value);

        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, "books"));
            
            // Check for duplicate book name (case-insensitive)
            let duplicateFound = false;
            if (snapshot.exists()) {
                snapshot.forEach((childSnap) => {
                    const existingBook = childSnap.val();
                    if (existingBook.title.toLowerCase() === titleInput.toLowerCase()) {
                        duplicateFound = true;
                    }
                });
            }

            if (duplicateFound) {
                alert(`Error: A book with the title "${titleInput}" already exists in the inventory!`);
                return;
            }

            const newBookRef = push(ref(db, 'books'));
            await set(newBookRef, {
                title: titleInput,
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

// Populate Checkout Dropdowns (Alphabetically Sorted)
async function loadDropdowns() {
    const bookSelect = document.getElementById('checkout-book-select');
    const memberSelect = document.getElementById('checkout-member-select');
    if (!bookSelect || !memberSelect) return;

    bookSelect.innerHTML = '<option value="">Select Book...</option>';
    memberSelect.innerHTML = '<option value="">Select Character...</option>';

    const dbRef = ref(db);

    // Load available books
    const booksSnap = await get(child(dbRef, "books"));
    let booksList = [];
    if (booksSnap.exists()) {
        booksSnap.forEach((childSnap) => {
            booksList.push({ id: childSnap.key, ...childSnap.val() });
        });
        booksList.sort((a, b) => a.title.localeCompare(b.title));
        
        booksList.forEach(book => {
            if (book.availableStock > 0) {
                bookSelect.innerHTML += `<option value="${book.id}" data-title="${book.title}" data-stock="${book.availableStock}">${book.title} (Available: ${book.availableStock})</option>`;
            }
        });
    }

    // Load members
    const membersSnap = await get(child(dbRef, "members"));
    let membersList = [];
    if (membersSnap.exists()) {
        membersSnap.forEach((childSnap) => {
            membersList.push(childSnap.val());
        });
        membersList.sort((a, b) => a.name.localeCompare(b.name));

        membersList.forEach(member => {
            memberSelect.innerHTML += `<option value="${member.name}">${member.name}</option>`;
        });
    }
}

// Handle Checkout Form Submission (with custom datetime & pricing)
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
        const dueDate = document.getElementById('due-date-input').value;
        const basePrice = parseFloat(document.getElementById('base-price-input').value);
        const dailyFee = parseFloat(document.getElementById('daily-fee-input').value);

        if (!bookId || !memberName || !dueDate) {
            alert("Please fill out all checkout fields.");
            return;
        }

        try {
            const checkoutTime = new Date().toISOString();
            const newRentalRef = push(ref(db, 'rentals'));
            await set(newRentalRef, {
                bookId,
                bookTitle,
                memberName,
                checkoutDate: checkoutTime,
                dueDate,
                basePrice,
                dailyFee
            });

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

// Calculate total cost on return and process it
window.returnBook = async function(rentalKey, bookId, basePrice, dailyFee, dueDateString) {
    const dueDate = new Date(dueDateString);
    const now = new Date();
    
    // Calculate days late (if any)
    let extraDays = 0;
    if (now > dueDate) {
        const diffTime = Math.abs(now - dueDate);
        extraDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    const totalOwed = basePrice + (extraDays * dailyFee);

    const confirmReturn = confirm(`Return Summary:\n- Base Price: ${basePrice}\n- Late Days: ${extraDays}\n- Late Fee: ${extraDays * dailyFee}\n\nTotal Owed by Character: ${totalOwed}\n\nConfirm return and restore stock?`);
    
    if (!confirmReturn) return;

    try {
        // 1. Remove rental record
        await remove(ref(db, `rentals/${rentalKey}`));

        // 2. Restore book stock (+1)
        const bookSnap = await get(child(ref(db), `books/${bookId}`));
        if (bookSnap.exists()) {
            const currentStock = bookSnap.val().availableStock;
            const totalStock = bookSnap.val().totalStock;
            const newStock = Math.min(currentStock + 1, totalStock);
            
            await update(ref(db, `books/${bookId}`), {
                availableStock: newStock
            });
        }

        alert(`Book returned successfully! Collected total: ${totalOwed}`);
        loadDashboardData();
        loadAdminInventory();
        loadDropdowns();
    } catch (err) {
        alert("Error processing return: " + err.message);
    }
};

// Load Admin Inventory View (Alphabetically sorted)
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

        let booksList = [];
        snapshot.forEach((childSnap) => {
            booksList.push(childSnap.val());
        });
        booksList.sort((a, b) => a.title.localeCompare(b.title));

        inventoryList.innerHTML = '';
        booksList.forEach(book => {
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

// Load Rentals & Overdue Check with Return Button & Cost Calculation
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
            const key = childSnap.key;
            const rental = childSnap.val();
            
            const checkoutFormatted = new Date(rental.checkoutDate).toLocaleString();
            const dueFormatted = new Date(rental.dueDate).toLocaleString();
            const isOverdue = new Date() > new Date(rental.dueDate);
            
            rentalsList.innerHTML += `
                <div class="rental-item ${isOverdue ? 'overdue-warning' : ''}" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div>
                        <p><strong>Book:</strong> ${rental.bookTitle} | <strong>Borrower:</strong> ${rental.memberName}</p>
                        <p style="font-size: 0.85rem; color: #aaa;">Rented: ${checkoutFormatted} | Due: ${dueFormatted}</p>
                        <p style="font-size: 0.85rem; color: #888;">Rates: Base ${rental.basePrice} + ${rental.dailyFee}/day</p>
                        ${isOverdue ? '<span class="badge-warning">⚠️ OVERDUE</span>' : ''}
                    </div>
                    <div>
                        <button class="btn-success" onclick="returnBook('${key}', '${rental.bookId}', ${rental.basePrice}, ${rental.dailyFee}, '${rental.dueDate}')">Return & Calculate Owed</button>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        rentalsList.innerHTML = `<p class="error-message">Error loading rentals: ${err.message}</p>`;
    }
}