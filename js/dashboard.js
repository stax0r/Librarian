import { auth, db } from "./firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// X Days Overdue Threshold Constant
const OVERDUE_LIMIT_DAYS = 7;

function checkIsOverdue(checkoutDateString) {
    const checkoutDate = new Date(checkoutDateString);
    const today = new Date();
    const diffTime = Math.abs(today - checkoutDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > OVERDUE_LIMIT_DAYS;
}

// Protect Route
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        loadDashboardData();
    }
});

// Logout
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
            await addDoc(collection(db, "members"), { name });
            alert("Character registered successfully!");
            document.getElementById('member-name').value = '';
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
            await addDoc(collection(db, "books"), {
                title,
                totalStock,
                availableStock: totalStock
            });
            alert("Book added to inventory!");
            document.getElementById('book-title').value = '';
            document.getElementById('book-stock').value = '1';
        } catch (err) {
            alert("Error adding book: " + err.message);
        }
    });
}

// Load Rentals & Apply Overdue Warning Check
async function loadDashboardData() {
    const rentalsList = document.getElementById('rentals-list');
    if (!rentalsList) return;

    rentalsList.innerHTML = '<p class="loading-text">Loading ledger records...</p>';
    
    try {
        const querySnapshot = await getDocs(collection(db, "rentals"));
        if (querySnapshot.empty) {
            rentalsList.innerHTML = '<p>No active rentals recorded in the ledger.</p>';
            return;
        }

        rentalsList.innerHTML = '';
        querySnapshot.forEach((docSnap) => {
            const rental = docSnap.data();
            const isOverdue = rental.checkoutDate ? checkIsOverdue(rental.checkoutDate) : false;
            
            rentalsList.innerHTML += `
                <div class="rental-item ${isOverdue ? 'overdue-warning' : ''}">
                    <p><strong>Book ID:</strong> ${rental.bookId} | <strong>Borrower:</strong> ${rental.memberName}</p>
                    ${isOverdue ? '<span class="badge-warning">⚠️ OVERDUE WARNING (> ' + OVERDUE_LIMIT_DAYS + ' days)</span>' : ''}
                </div>
            `;
        });
    } catch (err) {
        rentalsList.innerHTML = `<p class="error-message">Error loading rentals: ${err.message}</p>`;
    }
}