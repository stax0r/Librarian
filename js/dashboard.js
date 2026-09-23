import { auth, db } from "./firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, push, get, child, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const GRACE_PERIOD_DAYS = 1;

let cachedMembers = [];
let cachedInventory = [];
let cachedActiveRentals = {};
let cachedHistory = {};

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        loadDashboardData();
        loadAdminInventory();
        loadAdminMembers();
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

// Search Bar Event Listeners
document.addEventListener("DOMContentLoaded", () => {
    const memberSearchInput = document.getElementById('member-search');
    if (memberSearchInput) {
        memberSearchInput.addEventListener('input', (e) => {
            renderMembersList(e.target.value);
        });
    }

    const inventorySearchInput = document.getElementById('inventory-search');
    if (inventorySearchInput) {
        inventorySearchInput.addEventListener('input', (e) => {
            renderInventoryList(e.target.value);
        });
    }
});

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 50);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Modal Toggle Logic
const memberModal = document.getElementById('member-modal');
const bookModal = document.getElementById('book-modal');

document.getElementById('open-member-modal-btn').addEventListener('click', () => {
    memberModal.style.display = 'flex';
});

document.getElementById('open-book-modal-btn').addEventListener('click', () => {
    bookModal.style.display = 'flex';
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        memberModal.style.display = 'none';
        bookModal.style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target === memberModal) memberModal.style.display = 'none';
    if (e.target === bookModal) bookModal.style.display = 'none';
});

function formatMonthNameDay(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// Register Unique Member
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
                showToast(`Character "${nameInput}" is already registered!`, 'error');
                return;
            }

            const newMemberRef = push(ref(db, 'members'));
            await set(newMemberRef, { name: nameInput });
            showToast(`Character "${nameInput}" registered successfully!`);
            document.getElementById('member-name').value = '';
            memberModal.style.display = 'none';
            loadAdminMembers();
            loadDropdowns();
        } catch (err) {
            showToast("Error adding member: " + err.message, 'error');
        }
    });
}

// Delete Member with Confirmation
window.deleteMember = async function(memberKey, memberName) {
    const confirmDelete = confirm(`Are you sure you want to delete character "${memberName}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    try {
        await remove(ref(db, `members/${memberKey}`));
        showToast(`Character "${memberName}" deleted successfully.`);
        loadAdminMembers();
        loadDropdowns();
    } catch (err) {
        showToast("Error deleting member: " + err.message, 'error');
    }
};

// Complete Book Deletion from Inventory
window.deleteBook = async function(bookId, bookTitle) {
    const confirmDelete = confirm(`Are you sure you want to completely remove "${bookTitle}" from the library catalog?`);
    if (!confirmDelete) return;

    try {
        await remove(ref(db, `books/${bookId}`));
        showToast(`"${bookTitle}" deleted from catalog.`);
        loadAdminInventory();
        loadDashboardData();
        loadDropdowns();
    } catch (err) {
        showToast("Error deleting book: " + err.message, 'error');
    }
};

// Add New Book to Catalog
const catalogBookForm = document.getElementById('add-catalog-book-form');
if (catalogBookForm) {
    catalogBookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titleInput = document.getElementById('new-catalog-title').value.trim();

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
                showToast(`Book "${titleInput}" already exists in the catalog!`, 'error');
                return;
            }

            const newBookRef = push(ref(db, 'books'));
            await set(newBookRef, {
                title: titleInput,
                totalStock: 0,
                availableStock: 0
            });
            showToast(`"${titleInput}" added to catalog!`);
            document.getElementById('new-catalog-title').value = '';
            bookModal.style.display = 'none';
            loadAdminInventory();
            loadDropdowns();
        } catch (err) {
            showToast("Error adding book to catalog: " + err.message, 'error');
        }
    });
}

// Direct Stock Adjustment from Inventory Card
window.adjustStock = async function(bookId, bookTitle, currentTotal, currentAvailable, change) {
    const newTotalStock = currentTotal + change;
    const newAvailableStock = currentAvailable + change;

    if (newTotalStock < 0 || newAvailableStock < 0) {
        showToast("Stock cannot drop below zero.", 'error');
        return;
    }

    try {
        await update(ref(db, `books/${bookId}`), {
            totalStock: newTotalStock,
            availableStock: newAvailableStock
        });
        showToast(`Updated stock for "${bookTitle}"`);
        loadAdminInventory();
        loadDropdowns();
    } catch (err) {
        showToast("Error updating stock: " + err.message, 'error');
    }
};

// Populate Checkout Dropdowns
async function loadDropdowns() {
    const checkoutBookSelect = document.getElementById('checkout-book-select');
    const memberSelect = document.getElementById('checkout-member-select');
    
    if (checkoutBookSelect) checkoutBookSelect.innerHTML = '<option value="">Select Book...</option>';
    if (memberSelect) memberSelect.innerHTML = '<option value="">Select Character...</option>';

    const dbRef = ref(db);

    const booksSnap = await get(child(dbRef, "books"));
    if (booksSnap.exists()) {
        let booksList = [];
        booksSnap.forEach((childSnap) => {
            booksList.push({ id: childSnap.key, ...childSnap.val() });
        });
        booksList.sort((a, b) => a.title.localeCompare(b.title));
        
        booksList.forEach(book => {
            if (checkoutBookSelect && book.availableStock > 0) {
                checkoutBookSelect.innerHTML += `<option value="${book.id}" data-title="${book.title}" data-stock="${book.availableStock}">${book.title} (Available: ${book.availableStock})</option>`;
            }
        });
    }

    const membersSnap = await get(child(dbRef, "members"));
    if (membersSnap.exists()) {
        let membersList = [];
        membersSnap.forEach((childSnap) => {
            membersList.push(childSnap.val());
        });
        membersList.sort((a, b) => a.name.localeCompare(b.name));

        membersList.forEach(member => {
            if (memberSelect) {
                memberSelect.innerHTML += `<option value="${member.name}">${member.name}</option>`;
            }
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
            showToast("Please fill out all checkout fields.", 'error');
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

            const historyRef = push(ref(db, 'rentalHistory'));
            await set(historyRef, {
                bookTitle,
                memberName,
                checkoutDate: checkoutDate.toISOString(),
                dueDate: dueDate.toISOString()
            });

            await update(ref(db, `books/${bookId}`), {
                availableStock: currentStock - 1
            });

            showToast(`Rented "${bookTitle}" to ${memberName}!`);
            checkoutForm.reset();
            loadDashboardData();
            loadAdminInventory();
            loadAdminMembers();
            loadDropdowns();
        } catch (err) {
            showToast("Error processing checkout: " + err.message, 'error');
        }
    });
}

// Return Book
window.returnBook = async function(rentalKey, bookId) {
    const confirmReturn = confirm("Confirm return of this book and restore inventory stock?");
    if (!confirmReturn) return;

    try {
        const rentalRef = ref(db, `rentals/${rentalKey}`);
        await remove(rentalRef);

        const bookSnap = await get(child(ref(db), `books/${bookId}`));
        if (bookSnap.exists()) {
            const currentStock = bookSnap.val().availableStock;
            const totalStock = bookSnap.val().totalStock;
            const newStock = Math.min(currentStock + 1, totalStock);
            
            await update(ref(db, `books/${bookId}`), {
                availableStock: newStock
            });
        }

        showToast("Book returned and stock restored!");
        loadDashboardData();
        loadAdminInventory();
        loadAdminMembers();
        loadDropdowns();
    } catch (err) {
        showToast("Error processing return: " + err.message, 'error');
    }
};

// Load and Cache Admin Members Profile View
async function loadAdminMembers() {
    const membersListDiv = document.getElementById('members-list');
    if (!membersListDiv) return;

    membersListDiv.innerHTML = '<p class="loading-text">Loading members...</p>';

    try {
        const dbRef = ref(db);
        const membersSnap = await get(child(dbRef, "members"));
        const rentalsSnap = await get(child(dbRef, "rentals"));
        const historySnap = await get(child(dbRef, "rentalHistory"));

        if (!membersSnap.exists()) {
            cachedMembers = [];
            membersListDiv.innerHTML = '<p>No characters registered.</p>';
            return;
        }

        cachedActiveRentals = {};
        if (rentalsSnap.exists()) {
            rentalsSnap.forEach((childSnap) => {
                const r = childSnap.val();
                if (!cachedActiveRentals[r.memberName]) cachedActiveRentals[r.memberName] = [];
                cachedActiveRentals[r.memberName].push(r);
            });
        }

        cachedHistory = { lifetime: {}, missed: {} };
        if (historySnap.exists()) {
            historySnap.forEach((childSnap) => {
                const h = childSnap.val();
                cachedHistory.lifetime[h.memberName] = (cachedHistory.lifetime[h.memberName] || 0) + 1;

                const dueDate = new Date(h.dueDate);
                const gracePeriodDeadline = new Date(dueDate.getTime());
                gracePeriodDeadline.setDate(gracePeriodDeadline.getDate() + GRACE_PERIOD_DAYS);

                if (new Date() > gracePeriodDeadline) {
                    cachedHistory.missed[h.memberName] = (cachedHistory.missed[h.memberName] || 0) + 1;
                }
            });
        }

        cachedMembers = [];
        membersSnap.forEach((childSnap) => {
            cachedMembers.push({ id: childSnap.key, ...childSnap.val() });
        });
        cachedMembers.sort((a, b) => a.name.localeCompare(b.name));

        const searchVal = document.getElementById('member-search')?.value || '';
        renderMembersList(searchVal);
    } catch (err) {
        membersListDiv.innerHTML = `<p class="error-message">Error loading members: ${err.message}</p>`;
    }
}

function renderMembersList(query) {
    const membersListDiv = document.getElementById('members-list');
    if (!membersListDiv) return;

    const searchTerm = query.toLowerCase().trim();
    const filtered = cachedMembers.filter(m => m.name.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        membersListDiv.innerHTML = '<p>No matching characters found.</p>';
        return;
    }

    membersListDiv.innerHTML = '';
    filtered.forEach(member => {
        const activeRentals = cachedActiveRentals[member.name] || [];
        const lifetimeCount = cachedHistory.lifetime?.[member.name] || 0;
        const missedCount = cachedHistory.missed?.[member.name] || 0;

        let rentalsHtml = '';
        if (activeRentals.length > 0) {
            rentalsHtml = `<div style="margin-top: 6px; font-size: 0.82rem; color: #ccc;">
                <p style="color: #3b82f6; font-weight: bold; margin-bottom: 2px;">Currently Rented:</p>
                <ul style="margin-left: 16px;">`;
            
            activeRentals.forEach(r => {
                const dueFormatted = formatMonthNameDay(r.dueDate);
                const dueDateObj = new Date(r.dueDate);
                const graceDate = new Date(dueDateObj.getTime());
                graceDate.setDate(graceDate.getDate() + GRACE_PERIOD_DAYS);
                
                const isOverdue = new Date() > graceDate;
                let overdueText = '';

                if (isOverdue) {
                    const diffTime = Math.abs(new Date() - dueDateObj);
                    const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    overdueText = ` <span style="color: #ef4444; font-weight: bold;">(⚠️ Overdue by ${overdueDays}d)</span>`;
                }
                rentalsHtml += `<li>"${r.bookTitle}" (Due: ${dueFormatted})${overdueText}</li>`;
            });
            rentalsHtml += `</ul></div>`;
        } else {
            rentalsHtml = '<p style="font-size: 0.8rem; color: #777; margin-top: 4px;">No active books checked out.</p>';
        }

        membersListDiv.innerHTML += `
            <div class="rental-item" style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 1rem; color: #fff;"><strong>${member.name}</strong></span>
                    <button class="btn-danger btn-sm" onclick="deleteMember('${member.id}', '${member.name}')">Delete</button>
                </div>
                <p style="font-size: 0.82rem; color: #aaa; margin-top: 4px;">
                    📚 Total Rented: <strong style="color: #fff;">${lifetimeCount}</strong> | ❌ Missed Due Dates: <strong style="color: ${missedCount > 0 ? '#ef4444' : '#fff'};">${missedCount}</strong>
                </p>
                ${rentalsHtml}
            </div>
        `;
    });
}

// Load and Cache Admin Inventory View
async function loadAdminInventory() {
    const inventoryList = document.getElementById('admin-inventory-list');
    if (!inventoryList) return;

    inventoryList.innerHTML = '<p class="loading-text">Loading inventory stock...</p>';

    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, "books"));

        if (!snapshot.exists()) {
            cachedInventory = [];
            inventoryList.innerHTML = '<p>No books currently in stock.</p>';
            return;
        }

        cachedInventory = [];
        snapshot.forEach((childSnap) => {
            cachedInventory.push({ id: childSnap.key, ...childSnap.val() });
        });
        cachedInventory.sort((a, b) => a.title.localeCompare(b.title));

        const searchVal = document.getElementById('inventory-search')?.value || '';
        renderInventoryList(searchVal);
    } catch (err) {
        inventoryList.innerHTML = `<p class="error-message">Error loading inventory: ${err.message}</p>`;
    }
}

function renderInventoryList(query) {
    const inventoryList = document.getElementById('admin-inventory-list');
    if (!inventoryList) return;

    const searchTerm = query.toLowerCase().trim();
    const filtered = cachedInventory.filter(b => b.title.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        inventoryList.innerHTML = '<p>No matching inventory items found.</p>';
        return;
    }

    inventoryList.innerHTML = '';
    filtered.forEach(book => {
        inventoryList.innerHTML += `
            <div class="rental-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div>
                    <p><strong>${book.title}</strong></p>
                    <p style="font-size: 0.82rem; color: #aaa;">Available: ${book.availableStock} / Total: ${book.totalStock}</p>
                </div>
                <div style="display: flex; gap: 5px; align-items: center;">
                    <button class="btn-sm" onclick="adjustStock('${book.id}', '${book.title}', ${book.totalStock}, ${book.availableStock}, -1)" title="Remove Copy">-</button>
                    <button class="btn-sm" onclick="adjustStock('${book.id}', '${book.title}', ${book.totalStock}, ${book.availableStock}, 1)" title="Add Copy">+</button>
                    <button class="btn-danger btn-sm" onclick="deleteBook('${book.id}', '${book.title}')" title="Delete Book">🗑️</button>
                </div>
            </div>
        `;
    });
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
            const graceDate = new Date(dueDateObj.getTime());
            graceDate.setDate(graceDate.getDate() + GRACE_PERIOD_DAYS);
            
            const now = new Date();
            const isOverdue = now > graceDate;

            let overdueText = '';
            if (isOverdue) {
                const diffTime = Math.abs(now - dueDateObj);
                const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                overdueText = `<span class="badge-warning">⚠️ OVERDUE by ${overdueDays} day(s)</span>`;
            }
            
            rentalsList.innerHTML += `
                <div class="rental-item ${isOverdue ? 'overdue-warning' : ''}" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                        <p><strong>Book:</strong> ${rental.bookTitle} | <strong>Borrower:</strong> ${rental.memberName}</p>
                        <p style="font-size: 0.82rem; color: #aaa;">Rented: ${checkoutFormatted} | Due: ${dueFormatted}</p>
                        ${overdueText}
                    </div>
                    <div>
                        <button class="btn-success btn-sm" onclick="returnBook('${key}', '${rental.bookId}')">Return</button>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        rentalsList.innerHTML = `<p class="error-message">Error loading rentals: ${err.message}</p>`;
    }
}