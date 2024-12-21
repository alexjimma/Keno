// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    onSnapshot
} from "firebase/firestore";
import {
    getDatabase,
    ref,
    onValue,
    onDisconnect,
    set
} from "firebase/database";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC8MyCoDdno-YEu_BYMvXQ3T7BqcLs_xjM",
    authDomain: "keno-game-afe26.firebaseapp.com",
    databaseURL: "https://keno-game-afe26-default-rtdb.firebaseio.com",
    projectId: "keno-game-afe26",
    storageBucket: "keno-game-afe26.firebasestorage.app",
    messagingSenderId: "892072490783",
    appId: "1:892072490783:web:447f4d610bfe1a9369a22a",
    measurementId: "G-9NPKPVS8F5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const db = getFirestore(app);
const database = getDatabase(app);

window.db = db;
window.doc = doc;
window.setDoc = setDoc;
window.getDoc = getDoc;

// Initialize online players count
const onlinePlayersRef = ref(database, 'onlinePlayers');

// Update online players count in real-time
onValue(onlinePlayersRef, (snapshot) => {
    const onlineCount = snapshot.val() || 0;
    document.getElementById('onlinePlayers').textContent = onlineCount;
});

// Update online players when a user connects or disconnects
const username = localStorage.getItem('username');

if (username) {
    const userRef = ref(database, `users/${username}`);

    // Set user as online
    set(userRef, { online: true });

    // Remove user from online when disconnected
    onDisconnect(userRef).remove();

    // Increment online players count
    set(onlinePlayersRef, (prevCount) => (prevCount || 0) + 1);

    // Decrement online players count when user disconnects
    onDisconnect(onlinePlayersRef).set((prevCount) => (prevCount || 1) - 1);
}

window.initializePlayer = async function () {
    if (!username) {
        window.location.href = '/login/';
        return;
    }

    const playerRef = doc(db, "users", username);

    try {
        const docSnap = await getDoc(playerRef);

        if (docSnap.exists()) {
            window.playerBalance = docSnap.data().balance;
            document.querySelector('.balance-amount').textContent = `$${window.playerBalance.toFixed(2)}`;
            window.dispatchEvent(new Event('balanceInitialized'));
        } else {
            localStorage.removeItem('username');
            window.location.href = '/login/';
        }

        // Initialize win rate listener
        setupWinRateListener();

    } catch (error) {
        console.error("Error initializing player:", error);
        alert("Failed to initialize player. Please check your network connection and try again.");
    }
};

window.updateBalance = async function (newBalance) {
    if (!username) {
        window.location.href = '/login/';
        return;
    }

    window.playerBalance = newBalance;

    try {
        const playerRef = doc(db, "users", username);
        await setDoc(playerRef, { balance: window.playerBalance }, { merge: true });

        // Update balance immediately after each game
        document.querySelector('.balance-amount').textContent = `$${window.playerBalance.toFixed(2)}`;

    } catch (error) {
        console.error("Error updating balance:", error);
        alert("Failed to update balance. Please check your network connection and try again.");
    }
};

// Initialize player balance on page load
window.initializePlayer();

class KenoGame {
    constructor() {
        this.betAmount = 1.00;
        this.gameActive = false;
        this.selectedNumbers = new Set();
        this.drawnNumbers = new Set();
        this.maxSelections = 10; // Maximum numbers a player can select
        this.totalNumbers = 40; // Total numbers in the game
        this.gamesPlayed = parseInt(localStorage.getItem('keno_gamesPlayed')) || 0; // Track games played
        this.gamesWon = parseInt(localStorage.getItem('keno_gamesWon')) || 0; // Track games won
        this.payoutTable = { 0: 0, 1: 0.5, 2: 1, 3: 2, 4: 5, 5: 20 }; // Payout multipliers

        if (typeof window.playerBalance === 'undefined') {
            window.addEventListener('balanceInitialized', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        this.initializeDOM();
        this.initializeEventListeners();
        this.setupBalanceListener();
        this.updateBalanceDisplay();
        this.updateStats();
        this.createBoard();
    }

    setupBalanceListener() {
        const username = localStorage.getItem('username');

        if (!username) return;

        const playerRef = window.doc(window.db, "users", username);

        window.onSnapshot(playerRef, (doc) => {
            if (doc.exists()) {
                window.playerBalance = doc.data().balance; 
                this.updateBalanceDisplay(); 
            } else { 
                localStorage.removeItem('username'); 
                window.location.href = '/login/'; 
            }
        });
    }

    setupWinRateListener() {
        const username = localStorage.getItem('username');
        if (!username) return;

        const playerStatsRef = window.doc(window.db, "users", username);

        window.onSnapshot(playerStatsRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                if (data.gamesPlayed !== undefined && data.gamesWon !== undefined) {
                    this.gamesPlayed = data.gamesPlayed;
                    this.gamesWon = data.gamesWon;
                    this.updateStats();
                }
            }
        });
    }

    initializeDOM() {
        this.actionButton = document.getElementById('actionButton');
        this.betInput = document.getElementById('betAmount');
        this.kenoBoard = document.querySelector('.keno-board');
        this.selectedCountDisplay = document.querySelector('.selected-count span');
        this.drawnNumbersDisplay = document.querySelector('.drawn-numbers');
        this.resultOverlay = document.querySelector('.result-overlay');
    }

    initializeEventListeners() {
        this.actionButton.addEventListener('click', () => this.startGame());
        this.betInput.addEventListener('input', () => this.updateBetAmount());
        document.querySelector('.half-btn').addEventListener('click', () => this.adjustBet(0.5));
        document.querySelector('.double-btn').addEventListener('click', () => this.adjustBet(2));
    }

    createBoard() {
        for (let i = 1; i <= this.totalNumbers; i++) {
            const cell = document.createElement('div');
            cell.className = 'number-cell';
            cell.textContent = i;

            cell.addEventListener('click', () => this.toggleNumber(i, cell));
            this.kenoBoard.appendChild(cell);
        }
    }

    toggleNumber(number, cell) {
        if (this.gameActive) return;

        if (this.selectedNumbers.has(number)) { 
            this.selectedNumbers.delete(number); 
            cell.classList.remove('selected'); 
        } else if (this.selectedNumbers.size < this.maxSelections) { 
            this.selectedNumbers.add(number); 
            cell.classList.add('selected'); 
        }

        this.selectedCountDisplay.textContent = `${this.selectedNumbers.size}`;
        
        // Enable or disable the action button based on selections
        this.actionButton.disabled = !this.selectedNumbers.size; 
    }

    async startGame() { 
        if (this.gameActive || !this.selectedNumbers.size) return; 

        if (this.betAmount <= 0 || this.betAmount > window.playerBalance) { 
            return this.showResult('Invalid bet amount', '0.00', true); 
        }

        this.gameActive = true;

        // Reset drawn numbers and display them
        this.drawnNumbers.clear();
        this.drawnNumbersDisplay.innerHTML = '';
        
        // Deduct bet amount from player's balance
        window.playerBalance -= this.betAmount;
        await window.updateBalance(window.playerBalance); // Update balance immediately

        const numbersArray = Array.from({ length: this.totalNumbers }, (_, i) => i + 1);
        
        for (let i of numbersArray.sort(() => Math.random() - Math.random()).slice(0, 10)) { 
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate drawing time
            this.drawnNumbers.add(i);
            const drawnNumberDivElement = document.createElement('div');
            drawnNumberDivElement.className = 'drawn-number';
            drawnNumberDivElement.textContent = i;
            drawnNumberDivElement.style.animationDelay = `${i * 0.5}s`;
            this.drawnNumbersDisplay.appendChild(drawnNumberDivElement);
            
            const cell = document.querySelector(`.number-cell:nth-child(${i})`);
            cell.classList.add('drawn');
            
            if (this.selectedNumbers.has(i)) { 
                cell.classList.add('hit'); 
                await new Promise(resolve => setTimeout(resolve, 500)); // Simulate hit effect delay
            }
        }

        const matches = Array.from(this.selectedNumbers).filter(num => this.drawnNumbers.has(num)).length;
        const winAmount = this.payoutTable[matches] * this.betAmount;

        if (winAmount > 0) { 
            await window.updateBalance(window.playerBalance += winAmount); // Update balance immediately after winning
            this.gamesWon++;
        } 

        this.gamesPlayed++;
        await this.updateWinStats(); // Update win statistics in Firestore after each game

        this.showResult(winAmount > 0 ? 'Winner!' : 'Try Again!', `${winAmount > 0 ? '+' : '-'}$${winAmount.toFixed(2)}`);
        this.gameActive = false;
    }

    async updateWinStats() {
        const username = localStorage.getItem('username');

        if (!username)
            return;

        const playerStatsRef = window.doc(window.db, "users", username);

        try { 
            await window.setDoc(playerStatsRef, { gamesPlayed: this.gamesPlayed, gamesWon: this.gamesWon }, { merge: true });

            localStorage.setItem('keno_gamesPlayed', `${this.gamesPlayed}`);
            localStorage.setItem('keno_gamesWon', `${this.gamesWon}`);

            const winRatePercentage = ((this.gamesWon / Math.max(this.gamesPlayed, 1)) * 100).toFixed(1);

            document.querySelector('.win-rate-value').textContent = `${winRatePercentage}%`;
            document.querySelector('.total-played-value').textContent = `${this.gamesPlayed}`;

        } catch (error) { 
            console.error("Error updating stats:", error);
            alert("Failed to update game statistics. Please check your network connection and try again.");
        }
    }

    showResult(text, amount, isError=false) { 
        const overlay = this.resultOverlay;

        overlay.querySelector('.result-text').textContent = text;
        overlay.querySelector('.result-amount').textContent = amount;

        overlay.classList.add(isError ? 'error' : 'success');

        setTimeout(() =>
            overlay.classList.remove(isError ? 'error' : 'success'), 3000);
    }

    updateStats() { 
        // Update win rate and games played statistics
        const winRatePercentage = ((this.gamesWon / Math.max(this.gamesPlayed, 1)) * 100).toFixed(1);

        document.querySelector('.win-rate-value').textContent = `${winRatePercentage}%`;
        document.querySelector('.total-played-value').textContent = `${this.gamesPlayed}`;
    }

    updateBalanceDisplay() { 
        // Update displayed balance logic
        const balanceElement = document.querySelector('.balance-amount');
        balanceElement.textContent = `$${window.playerBalance.toFixed(2)}`;
    }

    adjustBet(multiplier) { 
        // Adjust bet amount based on button clicked
        let newBetAmount = parseFloat(this.betInput.value || '0') * multiplier;

        if (newBetAmount <= window.playerBalance && newBetAmount >= parseFloat(this.betInput.min)) {
            this.betInput.value = newBetAmount.toFixed(2);
            return void(this.betAmount = newBetAmount);
        }
    }

    updateBetAmount() { 
        // Update bet amount based on input value
        let newBetAmount = parseFloat(this.betInput.value || '0');

        if (newBetAmount <= window.playerBalance && newBetAmount >= parseFloat(this.betInput.min)) {
            return void(this.betAmount = newBetAmount);
        } else {
            alert("Invalid bet amount!");
        }
    }

    resetBoard() { 
        // Reset selected numbers and drawn numbers for a new game
        const cells = document.querySelectorAll('.number-cell');
        cells.forEach(cell => cell.classList.remove('selected', 'drawn', 'hit'));
        this.selectedNumbers.clear();
        this.selectedCountDisplay.textContent = "0";
    }
}

// Initialize the game when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => new KenoGame());