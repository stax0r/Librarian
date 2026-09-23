import { auth, db } from "./firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, push, get, child, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

// Helper function to format date as Full Month / Day (e.g., "September 23")
function formatMonthNameDay(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// Register Member with Unique Name Check
const memberForm = document.getElementById('add-member-form');
if (memberForm) {
    memberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('member-name').value.trim();

        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, "members"));
            
            let duplicateFound = false;
            if (snapshot.exists()) {
                snapshot.forEach((childSnap) => {
                    const existingMember = childSnap.val();
                    if (existingMember.name.toLowerCase() === nameInput.toLowerCase()) {
                        duplicateFound = true;
                    }
                });
            }

            if (duplicateFound) {
                alert(`Error: A character named "${nameInput}" is already registered! Character names must be unique.`);
                return;
            }

            const newMemberRef = push(ref(db, 'members'));
            await set(newMemberRef, { name: nameInput });
            alert("Character registered successfully!");
            document.getElementById('member-name').value = '';
            loadDropdowns();
        } catch (err) {
            alert("Error adding member: " + err.message);
        }
    });
}

// Add Book to Catalog / Inventory with Duplicate Name Check
const bookForm = document.getElementById('add-book-form');
if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titleInput = document.getElementById('book-title').value.trim();
        const totalStock = parseInt(document.getElementById('book-stock').value);

        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, "books"));
            
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
                alert(`Error: A book with the title "${titleInput}" already exists in the catalog!`);
                return;
            }

            const newBookRef = push(ref(db, 'books'));
            await set(newBookRef, {
                title: titleInput,
                totalStock,
                availableStock: totalStock
            });
            alert("Book added to catalog and inventory!");
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
        const rentalDays = parseInt(document.getElementById('rental-days-input').value);

        if (!bookId || !memberName) {
            alert("Please fill out all checkout fields.");
            return;
        }

        try {
            const checkoutDate = new Date();
            const dueDate = new Date(checkoutDate.getTime());
            dueDate.setDate(dueDate.getDate() + rentalDays);

            const newRentalRef = push(ref(db, 'rentals'));
            await set(newRentalRef, {
                bookId,
                bookTitle,
                memberName,
                checkoutDate: checkoutDate.toISOString(),
                dueDate: dueDate.toISOString(),
                rentalDays
            });

            await update(ref(db, `books/${bookId}`), {
                availableStock: currentStock - 1
            });

            alert(`Successfully rented "${bookTitle}" to ${memberName}! Due in ${rentalDays} days.`);
            checkoutForm.reset();
            loadAdminInventory();
            loadDashboardData();
            loadDropdowns();
        } catch (err) {
            alert("Error processing checkout: " + err.message);
        }
    });
}

// Return Book (Stock Restoration Only)
window.returnBook = async function(rentalKey, bookId) {
    const confirmReturn = confirm("Confirm return of this book and restore inventory stock?");
    if (!confirmReturn) return;

    try {
        await remove(ref(db, `rentals/${rentalKey}`));

        const bookSnap = await get(child(ref(db), `books/${bookId}`));
        if (bookSnap.exists()) {
            const currentStock = bookSnap.val().availableStock;
            const totalStock = bookSnap.val().totalStock;
            const newStock = Math.min(currentStock + 1, totalStock);
            
            await update(ref(db, `books/${bookId}`), {
                availableStock: newStock
            });
        }

        alert("Book returned successfully and stock restored!");
        loadDashboardData();
        loadAdminInventory();
        loadDropdowns();
    } catch (err) {
        alert("Error processing return: " + err.message);
    }
};

// Load Admin Inventory View (Alphabetically Sorted)
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

// Load Rentals Ledger
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
            
            const checkoutFormatted = formatMonthNameDay(rental.checkoutDate);
            const dueFormatted = formatMonthNameDay(rental.dueDate);
            
            const dueDateObj = new Date(rental.dueDate);
            const now = new Date();
            const isOverdue = now > dueDateObj;

            let overdueText = '';
            if (isOverdue) {
                const diffTime = Math.abs(now - dueDateObj);
                const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                overdueText = `<span class="badge-warning">⚠️ OVERDUE by ${overdueDays} day(s)</span>`;
            }
            
            rentalsList.innerHTML += `
                <div class="rental-item ${isOverdue ? 'overdue-warning' : ''}" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div>
                        <p><strong>Book:</strong> ${rental.bookTitle} | <strong>Borrower:</strong> ${rental.memberName}</p>
                        <p style="font-size: 0.85rem; color: #aaa;">Rented: ${checkoutFormatted} | Due: ${dueFormatted}</p>
                        ${overdueText}
                    </div>
                    <div>
                        <button class="btn-success" onclick="returnBook('${key}', '${rental.bookId}')">Return Book</button>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        rentalsList.innerHTML = `<p class="error-message">Error loading rentals: ${err.message}</p>`;
    }
}