
const firebaseConfig = {
  apiKey: "AIzaSyCyH2UpQl2NfdbQUbXhnXQNcy17iZT-G1c",
  authDomain: "appliancecare-d13ce.firebaseapp.com",
  projectId: "appliancecare-d13ce",
  appId: "1:1053469064664:web:b6ac6914d246bf8aa3c6ad"
};

const API_URL = "https://script.google.com/macros/s/AKfycbyMVuMCUiPBjR0MRH88duGFRLj7ak2IB_1B5nB9FhEeGOxrsnl1Lm9DAfZn4iBnY9MFQQ/exec";

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();

let me = null;
let profile = null;
let orders = [];
let services = [];

const $ = id => document.getElementById(id);

const MASTER_CATEGORIES = {
  "Air Conditioning": [
    "AC Services",
    "AC Repair Services",
    "AC Gas Charge",
    "AC Combo Services"
  ],
  "Appliance & Electronics": [
    "Appliance & Home Services",
    "Electronics & Gadgets Repair",
    "Gas Stove/ Burner"
  ],
  "Cleaning & Property Care": [
    "Cleaning Solution",
    "Tank & Pipe Cleaning Service",
    "Pest Control"
  ],
  "Home Maintenance": [
    "Electric & Plumbing",
    "Painting & Renovation",
    "Shifting"
  ],
  "Beauty & Wellness": [
    "Beauty & Wellness"
  ],
  "Transport & Vehicle Services": [
    "Driver Service",
    "Tourist Bus Rental",
    "Trips & Travels – Main Category",
    "Car Wash"
  ]
};

function api(params) {
  return new Promise((resolve, reject) => {
    if (!API_URL.startsWith("https://")) {
      return reject(Error("API URL is not configured"));
    }

    const callback = "ac_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");

    const timeout = setTimeout(() => {
      clean();
      reject(Error("Server timeout"));
    }, 20000);

    function clean() {
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
    }

    window[callback] = data => {
      clean();
      resolve(data);
    };

    params.callback = callback;
    params.token = window.__token;

    script.src = API_URL + "?" + new URLSearchParams(params);

    script.onerror = () => {
      clean();
      reject(Error("Backend connection failed"));
    };

    document.body.appendChild(script);
  });
}

async function post(payload) {
  payload.token = window.__token;

  const body = new URLSearchParams({
    payload: JSON.stringify(payload)
  });

  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body
  });
}

// Authentication

auth.onAuthStateChanged(async user => {
  if (!user) {
    $("login").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }

  try {
    window.__token = await user.getIdToken(true);
    me = user;

    const result = await api({ action: "me" });

    if (!result.ok) throw Error(result.error);

    profile = result.profile;

    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");

    $("userName").textContent = profile.name;
    $("userRole").textContent = profile.role;

    document.querySelectorAll("[data-role]").forEach(el => {
      el.classList.toggle("hidden", profile.role !== "ADMIN");
    });

    await refreshAll();

  } catch (error) {
    $("loginMsg").textContent = error.message;
    await auth.signOut();
  }
});

$("loginForm").onsubmit = async event => {
  event.preventDefault();

  $("loginMsg").textContent = "Signing in...";

  try {
    await auth.signInWithEmailAndPassword(
      $("email").value.trim(),
      $("password").value
    );
  } catch (error) {
    $("loginMsg").textContent = "Login failed: " + error.message;
  }
};

$("forgot").onclick = async () => {
  const email = $("email").value.trim();

  if (!email) {
    $("loginMsg").textContent = "Please enter your email address first.";
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    $("loginMsg").textContent = "Password reset email sent.";
  } catch (error) {
    $("loginMsg").textContent = error.message;
  }
};

$("logout").onclick = () => auth.signOut();

$("menu").onclick = () => {
  $("sidebar").classList.toggle("open");
};

// Navigation

document.querySelectorAll(".nav[data-page]").forEach(button => {
  button.onclick = () => showPage(button.dataset.page);
});

function showPage(page) {
  document.querySelectorAll(".page").forEach(item => {
    item.classList.add("hidden");
  });

  $(page).classList.remove("hidden");

  document.querySelectorAll(".nav").forEach(item => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  $("sidebar").classList.remove("open");

  if (page === "orders") renderOrders();
  if (page === "employees") loadEmployees();
  if (page === "activity") loadActivity();
  if (page === "customers") renderCustomers();
  if (page === "services") renderServices();
}

$("quickAdd").onclick = $("addOrder").onclick = orderModal;
$("refreshOrders").onclick = refreshAll;

$("globalSearch").onclick = () => {
  showPage("orders");
  $("orderFilter").value = $("globalQ").value;
  renderOrders();
};

$("orderFilter").oninput = renderOrders;
$("statusFilter").onchange = renderOrders;

$("addService").onclick = serviceModal;
$("addEmployee").onclick = employeeModal;

$("closeModal").onclick = closeM;

function modal(html) {
  $("modalContent").innerHTML = html;
  $("modal").classList.remove("hidden");
}

function closeM() {
  $("modal").classList.add("hidden");
}

// Load data

async function refreshAll() {
  const [orderResult, serviceResult] = await Promise.all([
    api({ action: "list" }),
    api({ action: "services" })
  ]);

  if (!orderResult.ok) throw Error(orderResult.error);
  if (!serviceResult.ok) throw Error(serviceResult.error);

  orders = orderResult.orders || [];
  services = serviceResult.services || [];

  renderDashboard();
  renderOrders();
  renderServices();
}

// Dashboard

function renderDashboard() {
  const statuses = [
    "Pending",
    "Declined",
    "Not Responded",
    "Scheduled",
    "Processing",
    "Service Due",
    "Completed",
    "Active",
    "Cancelled"
  ];

  const icons = ["▤", "⊘", "♧", "◷", "⟳", "◴", "✓", "⊕", "▣"];

  $("stats").innerHTML = statuses.map((status, index) => `
    <div class="stat">
      <div class="ico">${icons[index]}</div>
      <div>
        <small>${status.toUpperCase()}</small>
        <strong>${orders.filter(o => o.status === status).length}</strong>
      </div>
    </div>
  `).join("");

  $("orderBadge").textContent = orders.length;

  $("recent").innerHTML = table(orders.slice(-8).reverse());

  $("statusSummary").innerHTML = statuses.map(status => `
    <p>${status}
      <b style="float:right">
        ${orders.filter(o => o.status === status).length}
      </b>
    </p>
  `).join("");
}

// Tables

function table(rows) {
  if (!rows.length) return "<p class='muted'>No records found.</p>";

  return `
    <table>
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Phone</th>
          <th>Service</th>
          <th>Status</th>
          <th>PDF</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(order => `
          <tr>
            <td><b>${esc(order.id)}</b></td>
            <td>${esc(order.customerName)}</td>
            <td>${esc(order.phone)}</td>
            <td>${esc(order.service)}</td>
            <td>
              <span class="pill ${esc(order.status)}">
                ${esc(order.status)}
              </span>
            </td>
            <td>
              ${order.pdfUrl
                ? `<a target="_blank" href="${esc(order.pdfUrl)}">PDF</a>`
                : "—"}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderOrders() {
  const query = ($("orderFilter")?.value || "").toLowerCase();
  const status = $("statusFilter")?.value || "";

  const filtered = orders.filter(order =>
    (!status || order.status === status) &&
    [
      order.id,
      order.customerName,
      order.phone,
      order.service
    ].some(value => String(value).toLowerCase().includes(query))
  );

  $("ordersTable").innerHTML = table(filtered);
}

function renderCustomers() {
  const map = {};

  orders.forEach(order => {
    map[order.phone] = order;
  });

  const customers = Object.values(map).map(order => ({
    id: order.customerName,
    customerName: order.customerName,
    phone: order.phone,
    service: order.location,
    status: "Customer",
    pdfUrl: ""
  }));

  $("customersTable").innerHTML = table(customers);
}

// Service helpers

function getSubCategories(master) {
  return MASTER_CATEGORIES[master] || [];
}

function getMasterCategory(category) {
  return Object.keys(MASTER_CATEGORIES).find(master =>
    MASTER_CATEGORIES[master].includes(category)
  ) || "";
}

function formatPrice(value) {
  if (value === "" || value == null) return "—";
  return "৳" + Number(value).toLocaleString("en-BD");
}

function servicePriceText(service) {
  if (!service) return "";

  return `
    <p>Discount Price: <b>${formatPrice(service.discountPrice)}</b></p>
    <p>Regular Price: <b>${formatPrice(service.regularPrice)}</b></p>
  `;
}

// Service management

function renderServices() {
  $("servicesTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Service Name</th>
          <th>Discount Price</th>
          <th>Regular Price</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${services.map((service, index) => `
          <tr>
            <td>${esc(service.category)}</td>
            <td>${esc(service.name)}</td>
            <td>${formatPrice(service.discountPrice)}</td>
            <td>${formatPrice(service.regularPrice)}</td>
            <td>
              <button onclick="editService(${index})">Edit</button>
              <button onclick="removeService('${esc(service.name)}')">Remove</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function categoryOptions(selected = "") {
  const categories = Object.values(MASTER_CATEGORIES).flat();

  return categories.map(category => `
    <option value="${esc(category)}"
      ${category === selected ? "selected" : ""}>
      ${esc(category)}
    </option>
  `).join("");
}

function serviceModal() {
  modal(`
    <h2>Add Service</h2>

    <div class="formgrid">
      <div class="full">
        <label>Sub Category</label>
        <select id="serviceCategory">
          <option value="">Select Category</option>
          ${categoryOptions()}
        </select>
      </div>

      <div class="full">
        <label>Service Name</label>
        <input id="serviceName" placeholder="Enter service name">
      </div>

      <div>
        <label>Discount Price</label>
        <input id="serviceDiscount" type="number" min="0">
      </div>

      <div>
        <label>Regular Price</label>
        <input id="serviceRegular" type="number" min="0">
      </div>
    </div>

    <div class="actions">
      <button class="primary" onclick="saveService()">Save Service</button>
      <button onclick="closeM()">Cancel</button>
    </div>
  `);
}

function editService(index) {
  const service = services[index];
  if (!service) return;

  modal(`
    <h2>Edit Service</h2>

    <div class="formgrid">
      <div class="full">
        <label>Sub Category</label>
        <select id="serviceCategory">
          ${categoryOptions(service.category)}
        </select>
      </div>

      <div class="full">
        <label>Service Name</label>
        <input id="serviceName" value="${esc(service.name)}" disabled>
      </div>

      <div>
        <label>Discount Price</label>
        <input id="serviceDiscount" type="number" min="0"
          value="${service.discountPrice ?? ""}">
      </div>

      <div>
        <label>Regular Price</label>
        <input id="serviceRegular" type="number" min="0"
          value="${service.regularPrice ?? ""}">
      </div>
    </div>

    <div class="actions">
      <button class="primary" onclick="updateServicePrice('${esc(service.name)}')">
        Update Service
      </button>
      <button onclick="closeM()">Cancel</button>
    </div>
  `);
}

async function saveService() {
  const category = $("serviceCategory").value;
  const name = $("serviceName").value.trim();

  if (!category || !name) {
    alert("Please enter the category and service name.");
    return;
  }

  await post({
    action: "addService",
    category,
    name,
    discountPrice: $("serviceDiscount").value,
    regularPrice: $("serviceRegular").value
  });

  closeM();
  alert("Service save request sent.");
  setTimeout(refreshAll, 3000);
}

async function updateServicePrice(name) {
  await post({
    action: "updateService",
    name,
    category: $("serviceCategory").value,
    discountPrice: $("serviceDiscount").value,
    regularPrice: $("serviceRegular").value
  });

  closeM();
  alert("Service update request sent.");
  setTimeout(refreshAll, 3000);
}

async function removeService(name) {
  if (!confirm("Are you sure you want to deactivate this service?")) {
    return;
  }

  await post({
    action: "removeService",
    name
  });

  setTimeout(refreshAll, 3000);
}

// Three-level searchable service selection

function orderModal() {
  const masters = Object.keys(MASTER_CATEGORIES);

  modal(`
    <h2>New Order</h2>

    <div class="formgrid">

      <div>
        <label>Customer Name *</label>
        <input id="f_name" required>
      </div>

      <div>
        <label>Phone Number *</label>
        <input id="f_phone" required>
      </div>

      <div class="full">
        <label>Location *</label>
        <input id="f_location" required>
      </div>

      <div class="full">
        <label>1. Master Category *</label>
        <select id="f_master">
          <option value="">Select Master Category</option>
          ${masters.map(master => `
            <option value="${esc(master)}">${esc(master)}</option>
          `).join("")}
        </select>
      </div>

      <div class="full">
        <label>2. Sub Category *</label>
        <select id="f_sub" disabled>
          <option value="">Select Sub Category</option>
        </select>
      </div>

      <div class="full">
        <label>3. Search Service Name *</label>
        <input id="f_service"
          list="serviceSuggestions"
          placeholder="Type service name to search..."
          autocomplete="off"
          disabled>
        <datalist id="serviceSuggestions"></datalist>
      </div>

      <div class="full" id="selectedServicePrice"></div>

      <div class="full">
        <label>Order Details</label>
        <textarea id="f_details"></textarea>
      </div>

      <div class="full">
        <label>Additional Comments</label>
        <textarea id="f_comments"></textarea>
      </div>

    </div>

    <div class="actions">
      <button class="primary" id="confirmOrder">Confirm Order</button>
      <button onclick="closeM()">Cancel</button>
    </div>
  `);

  $("f_master").onchange = updateSubCategories;
  $("f_sub").onchange = updateServiceSuggestions;
  $("f_service").oninput = showSelectedServicePrice;
  $("f_service").onchange = showSelectedServicePrice;

  $("confirmOrder").onclick = saveOrder;
}

function updateSubCategories() {
  const master = $("f_master").value;
  const categories = getSubCategories(master);

  $("f_sub").innerHTML = `
    <option value="">Select Sub Category</option>
    ${categories.map(category => `
      <option value="${esc(category)}">${esc(category)}</option>
    `).join("")}
  `;

  $("f_sub").disabled = false;
  $("f_service").value = "";
  $("f_service").disabled = true;
  $("serviceSuggestions").innerHTML = "";
  $("selectedServicePrice").innerHTML = "";
}

function updateServiceSuggestions() {
  const category = $("f_sub").value;

  $("f_service").value = "";
  $("selectedServicePrice").innerHTML = "";

  const matching = services.filter(service =>
    service.category === category
  );

  $("serviceSuggestions").innerHTML = matching.map(service => `
    <option value="${esc(service.name)}"></option>
  `).join("");

  $("f_service").disabled = !category;
}

function showSelectedServicePrice() {
  const category = $("f_sub").value;
  const name = $("f_service").value.trim();

  const selected = services.find(service =>
    service.category === category &&
    service.name.toLowerCase() === name.toLowerCase()
  );

  if (!selected) {
    $("selectedServicePrice").innerHTML = "";
    return;
  }

  $("selectedServicePrice").innerHTML = `
    <div class="panel">
      <h3>${esc(selected.name)}</h3>
      ${servicePriceText(selected)}
    </div>
  `;
}

// Create order

async function saveOrder() {
  const category = $("f_sub").value;
  const name = $("f_service").value.trim();

  const selected = services.find(service =>
    service.category === category &&
    service.name.toLowerCase() === name.toLowerCase()
  );

  const payload = {
    action: "create",
    customerName: $("f_name").value.trim(),
    phone: $("f_phone").value.trim(),
    location: $("f_location").value.trim(),
    service: selected ? selected.name : "",
    details: $("f_details").value,
    comments: $("f_comments").value
  };

  if (
    !payload.customerName ||
    !payload.phone ||
    !payload.location ||
    !selected
  ) {
    alert("Please complete all required fields and select a valid service.");
    return;
  }

  await post(payload);

  closeM();

  alert("Order request sent. Refresh the Orders page shortly.");

  setTimeout(refreshAll, 3500);
}

// Employee management

function employeeModal() {
  modal(`
    <h2>New Employee</h2>

    <div class="formgrid">
      <div>
        <label>Name</label>
        <input id="e_name">
      </div>

      <div>
        <label>Email</label>
        <input id="e_email" type="email">
      </div>

      <div>
        <label>Temporary Password</label>
        <input id="e_pass" type="password">
      </div>

      <div>
        <label>Role</label>
        <select id="e_role">
          <option value="EMPLOYEE">EMPLOYEE</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>
    </div>

    <div class="actions">
      <button class="primary" onclick="saveEmployee()">Create Account</button>
      <button onclick="closeM()">Cancel</button>
    </div>
  `);
}

async function saveEmployee() {
  const name = $("e_name").value.trim();
  const email = $("e_email").value.trim();
  const password = $("e_pass").value;
  const role = $("e_role").value;

  if (!name || !email || password.length < 6) {
    alert("Please enter a name, valid email and password of at least 6 characters.");
    return;
  }

  await post({
    action: "createEmployee",
    name,
    email,
    password,
    role
  });

  closeM();

  alert("Employee account creation request sent.");

  setTimeout(loadEmployees, 3500);
}

async function loadEmployees() {
  const result = await api({ action: "employees" });

  if (!result.ok) {
    $("employeesTable").textContent = result.error;
    return;
  }

  $("employeesTable").innerHTML = table(
    (result.employees || []).map(employee => ({
      id: employee.employeeId,
      customerName: employee.name,
      phone: employee.email,
      service: employee.role,
      status: employee.status,
      pdfUrl: ""
    }))
  );
}

async function loadActivity() {
  const result = await api({ action: "activity" });

  if (!result.ok) {
    $("activityTable").textContent = result.error;
    return;
  }

  $("activityTable").innerHTML = table(
    (result.logs || []).map(item => ({
      id: item.date,
      customerName: item.employee,
      phone: item.action,
      service: item.record,
      status: "Logged",
      pdfUrl: ""
    }))
  );
}

// Escape HTML

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
