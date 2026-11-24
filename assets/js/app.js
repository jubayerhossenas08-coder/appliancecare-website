
const firebaseConfig = {
  apiKey: "AIzaSyCyH2UpQl2NfdbQUbXhnXQNcy17iZT-G1c",
  authDomain: "appliancecare-d13ce.firebaseapp.com",
  projectId: "appliancecare-d13ce",
  appId: "1:1053469064664:web:b6ac6914d246bf8aa3c6ad"
};

const API_URL = "https://script.google.com/macros/s/AKfycbz1oA7D3DAFXLeNs9jgvt_IsnYkRqepiXy7rTrv62VLFhPU0R2mYjrHXaPqJdWstpapfg/exec";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

let me = null;
let profile = null;
let orders = [];
let services = [];
let selectedServices = [];

const $ = id => document.getElementById(id);

const MASTER_CATEGORIES = {
  "Air Conditioning": [
    "AC Services", "AC Repair Services",
    "AC Gas Charge", "AC Combo Services"
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
  "Beauty & Wellness": ["Beauty & Wellness"],
  "Transport & Vehicle Services": [
    "Driver Service",
    "Tourist Bus Rental",
    "Trips & Travels – Main Category",
    "Car Wash"
  ]
};

// ---------- API ----------

function api(params) {
  return new Promise((resolve, reject) => {
    if (!API_URL.startsWith("https://")) {
      reject(Error("API URL is not configured."));
      return;
    }

    const callback = "ac_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const query = new URLSearchParams({
      ...params,
      callback,
      token: window.__token || ""
    });

    const timer = setTimeout(() => {
      clean();
      reject(Error("Server timeout. Please try again."));
    }, 25000);

    function clean() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    window[callback] = data => {
      clean();
      if (!data || data.ok !== true) {
        reject(Error(data?.error || "Server request failed."));
        return;
      }
      resolve(data);
    };

    script.src = API_URL + "?" + query.toString();
    script.onerror = () => {
      clean();
      reject(Error("Backend connection failed."));
    };

    document.body.appendChild(script);
  });
}

// Apps Script POST uses no-cors, so the browser cannot read its response.
// Refreshing the data afterwards confirms whether the change was saved.
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

async function submitAndRefresh(payload, afterRefresh) {
  await post(payload);
  await new Promise(resolve => setTimeout(resolve, 1800));
  await refreshAll();
  if (afterRefresh) afterRefresh();
}

// ---------- Authentication ----------

auth.onAuthStateChanged(async user => {
  if (!user) {
    me = null;
    profile = null;
    $("login").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }

  try {
    window.__token = await user.getIdToken(true);
    me = user;

    const result = await api({ action: "me" });
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
$("menu").onclick = () => $("sidebar").classList.toggle("open");

// ---------- Navigation ----------

document.querySelectorAll(".nav[data-page]").forEach(button => {
  button.onclick = () => showPage(button.dataset.page);
});

function showPage(page) {
  document.querySelectorAll(".page").forEach(item =>
    item.classList.add("hidden")
  );

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

// ---------- Load data ----------

async function refreshAll() {
  const [orderResult, serviceResult] = await Promise.all([
    api({ action: "list" }),
    api({ action: "services" })
  ]);

  orders = orderResult.orders || [];
  services = serviceResult.services || [];

  renderDashboard();
  renderOrders();
  renderServices();
}

// ---------- Dashboard ----------

function renderDashboard() {
  const statuses = [
    "Pending", "Declined", "Not Responded", "Scheduled",
    "Processing", "Service Due", "Completed", "Active", "Cancelled"
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
    <p>${esc(status)}
      <b style="float:right">
        ${orders.filter(o => o.status === status).length}
      </b>
    </p>
  `).join("");

  renderCommissionSummary();
}

function renderCommissionSummary() {
  let panel = $("commissionSummary");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "commissionSummary";
    panel.className = "commission-summary";
    $("stats").insertAdjacentElement("afterend", panel);
  }

  if (!profile || profile.role !== "ADMIN") {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");

  const regular = orders.reduce((sum, o) =>
    sum + (Number(o.regularTotal) || 0), 0);
  const sp = orders.reduce((sum, o) =>
    sum + (Number(o.spCommission) || 0), 0);
  const company = orders.reduce((sum, o) =>
    sum + (Number(o.applianceCareCommission) || 0), 0);

  panel.innerHTML = `
    <div class="commission-card">
      <small>Regular Price Total</small>
      <strong>${formatPrice(regular)}</strong>
    </div>
    <div class="commission-card">
      <small>SP Commission (70%)</small>
      <strong>${formatPrice(sp)}</strong>
    </div>
    <div class="commission-card">
      <small>ApplianceCare Commission (30%)</small>
      <strong>${formatPrice(company)}</strong>
    </div>
  `;
}

// ---------- Tables ----------

function table(rows) {
  if (!rows.length) return "<p class='muted'>No records found.</p>";

  return `
    <div class="tablewrap">
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
              <td><span class="pill ${statusClass(order.status)}">
                ${esc(order.status)}
              </span></td>
              <td>${order.pdfUrl
                ? `<a target="_blank" rel="noopener" href="${esc(order.pdfUrl)}">PDF</a>`
                : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function statusClass(status) {
  return String(status || "").replace(/[^a-zA-Z]/g, "");
}

function renderOrders() {
  const query = ($("orderFilter")?.value || "").trim().toLowerCase();
  const status = $("statusFilter")?.value || "";

  const filtered = orders.filter(order =>
    (!status || order.status === status) &&
    [
      order.id, order.customerName, order.phone,
      order.service, order.location
    ].some(value => String(value || "").toLowerCase().includes(query))
  );

  if (!filtered.length) {
    $("ordersTable").innerHTML = "<p class='muted'>No orders found.</p>";
    return;
  }

  $("ordersTable").innerHTML = `
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Customer</th>
            <th>Phone</th>
            <th>Services</th>
            <th>Regular Total</th>
            <th>Payable Total</th>
            <th>Status</th>
            <th>Invoice</th>
            <th>Update</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((order, index) => `
            <tr>
              <td><b>${esc(order.id)}</b></td>
              <td>${esc(order.customerName)}</td>
              <td>${esc(order.phone)}</td>
              <td>${esc(order.service)}</td>
              <td>${formatPrice(order.regularTotal)}</td>
              <td><b>${formatPrice(order.discountTotal)}</b></td>
              <td>
                <select class="status-select" data-status-index="${index}">
                  ${statusOptions(order.status)}
                </select>
              </td>
              <td>
                <button class="small-btn invoice-btn"
                  data-invoice-id="${esc(order.id)}">PDF</button>
              </td>
              <td>
                <button class="small-btn update-status-btn"
                  data-status-index="${index}">Save</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  $("ordersTable").querySelectorAll(".update-status-btn").forEach(button => {
    button.onclick = async () => {
      const index = Number(button.dataset.statusIndex);
      const order = filtered[index];
      const select = $("ordersTable").querySelector(
        `[data-status-index="${index}"].status-select`
      );
      if (!order || !select) return;

      button.disabled = true;
      button.textContent = "Saving...";

      try {
        await post({
          action: "updateStatus",
          id: order.id,
          status: select.value
        });
        await new Promise(resolve => setTimeout(resolve, 1500));
        await refreshAll();
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
        button.textContent = "Save";
      }
    };
  });

  $("ordersTable").querySelectorAll(".invoice-btn").forEach(button => {
    button.onclick = () => generateInvoice(button.dataset.invoiceId);
  });
}

function statusOptions(current) {
  return [
    "Pending", "Declined", "Not Responded", "Scheduled",
    "Processing", "Service Due", "Completed", "Active", "Cancelled"
  ].map(status => `
    <option value="${status}" ${status === current ? "selected" : ""}>
      ${status}
    </option>
  `).join("");
}

async function generateInvoice(id) {
  try {
    const result = await api({ action: "invoice", id });
    if (result.pdfUrl) {
      window.open(result.pdfUrl, "_blank", "noopener");
      await refreshAll();
    } else {
      alert("Invoice could not be generated.");
    }
  } catch (error) {
    alert("Invoice error: " + error.message);
  }
}

function renderCustomers() {
  const map = {};
  orders.forEach(order => {
    if (order.phone) map[order.phone] = order;
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

// ---------- Service helpers ----------

function getSubCategories(master) {
  return MASTER_CATEGORIES[master] || [];
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

function categoryOptions(selected = "") {
  return Object.values(MASTER_CATEGORIES).flat().map(category => `
    <option value="${esc(category)}"
      ${category === selected ? "selected" : ""}>
      ${esc(category)}
    </option>
  `).join("");
}

// ---------- Service management ----------

function renderServices() {
  if (!$("servicesTable")) return;

  $("servicesTable").innerHTML = `
    <div class="tablewrap">
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
                <button class="small-btn edit-service-btn"
                  data-service-index="${index}">Edit</button>
                <button class="small-btn remove-service-btn"
                  data-service-index="${index}">Remove</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  $("servicesTable").querySelectorAll(".edit-service-btn").forEach(button => {
    button.onclick = () => editService(Number(button.dataset.serviceIndex));
  });

  $("servicesTable").querySelectorAll(".remove-service-btn").forEach(button => {
    button.onclick = () => {
      const service = services[Number(button.dataset.serviceIndex)];
      if (service) removeService(service.name, service.category);
    };
  });
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
      <button class="primary" id="saveServiceBtn">Save Service</button>
      <button onclick="closeM()">Cancel</button>
    </div>
  `);

  $("saveServiceBtn").onclick = saveService;
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
      <button class="primary" id="updateServiceBtn">Update Service</button>
      <button onclick="closeM()">Cancel</button>
    </div>
  `);

  $("updateServiceBtn").onclick = () =>
    updateServicePrice(service.name, service.category);
}

async function saveService() {
  const category = $("serviceCategory").value;
  const name = $("serviceName").value.trim();

  if (!category || !name) {
    alert("Please enter the category and service name.");
    return;
  }

  try {
    await submitAndRefresh({
      action: "addService",
      category,
      name,
      discountPrice: $("serviceDiscount").value,
      regularPrice: $("serviceRegular").value
    });
    closeM();
    alert("Service request submitted. Please check the Services list.");
  } catch (error) {
    alert(error.message);
  }
}

async function updateServicePrice(name, oldCategory) {
  try {
    await submitAndRefresh({
      action: "updateService",
      name,
      oldCategory,
      category: $("serviceCategory").value,
      discountPrice: $("serviceDiscount").value,
      regularPrice: $("serviceRegular").value
    });
    closeM();
    alert("Service update request submitted.");
  } catch (error) {
    alert(error.message);
  }
}

async function removeService(name, category) {
  if (!confirm("Are you sure you want to deactivate this service?")) return;

  try {
    await submitAndRefresh({
      action: "removeService",
      name,
      category
    });
  } catch (error) {
    alert(error.message);
  }
}

// ---------- Multiple-service order form ----------

function orderModal() {
  selectedServices = [];
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
        <input id="f_service" list="serviceSuggestions"
          placeholder="Type service name to search..."
          autocomplete="off" disabled>
        <datalist id="serviceSuggestions"></datalist>
      </div>

      <div class="full" id="selectedServicePrice"></div>

      <div class="full">
        <button type="button" id="addSelectedService" class="primary">
          + Add This Service
        </button>
      </div>

      <div class="full">
        <h3>Selected Services</h3>
        <div id="selectedServicesList">
          <p class="muted">No services added yet.</p>
        </div>
      </div>

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
  $("addSelectedService").onclick = addSelectedService;
  $("confirmOrder").onclick = saveOrder;
}

function updateSubCategories() {
  const categories = MASTER_CATEGORIES[$("f_master").value] || [];

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

function getCurrentSelectedService() {
  const category = $("f_sub").value;
  const name = $("f_service").value.trim();

  return services.find(service =>
    service.category === category &&
    service.name.toLowerCase() === name.toLowerCase()
  );
}

function showSelectedServicePrice() {
  const selected = getCurrentSelectedService();

  if (!selected) {
    $("selectedServicePrice").innerHTML = "";
    return;
  }

  $("selectedServicePrice").innerHTML = `
    <div class="panel selected-price">
      <h3>${esc(selected.name)}</h3>
      ${servicePriceText(selected)}
    </div>
  `;
}

function addSelectedService() {
  const service = getCurrentSelectedService();

  if (!service) {
    alert("Please select a valid service from the suggestions.");
    return;
  }

  const exists = selectedServices.some(item =>
    item.category === service.category && item.name === service.name
  );

  if (exists) {
    alert("This service has already been added.");
    return;
  }

  const regularPrice = Number(service.regularPrice) || 0;
  const hasDiscount =
    service.discountPrice !== "" && service.discountPrice != null;
  const discountPrice = hasDiscount
    ? Number(service.discountPrice)
    : null;

  selectedServices.push({
    category: service.category,
    name: service.name,
    regularPrice,
    discountPrice,
    payablePrice: hasDiscount ? discountPrice : regularPrice
  });

  renderSelectedServices();
  $("f_service").value = "";
  $("selectedServicePrice").innerHTML = "";
}

function renderSelectedServices() {
  if (!selectedServices.length) {
    $("selectedServicesList").innerHTML =
      "<p class='muted'>No services added yet.</p>";
    return;
  }

  const regular = selectedServices.reduce((sum, s) =>
    sum + s.regularPrice, 0);
  const payable = selectedServices.reduce((sum, s) =>
    sum + s.payablePrice, 0);

  $("selectedServicesList").innerHTML = `
    <div class="tablewrap">
      <table class="selected-service-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Regular</th>
            <th>Payable</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${selectedServices.map((service, index) => `
            <tr>
              <td>
                <b>${esc(service.name)}</b>
                <small class="muted">${esc(service.category)}</small>
              </td>
              <td>${formatPrice(service.regularPrice)}</td>
              <td>${formatPrice(service.payablePrice)}</td>
              <td>
                <button type="button" class="remove-selected-btn"
                  data-selected-index="${index}">Remove</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="order-totals">
      <p>Regular Price Total: <b>${formatPrice(regular)}</b></p>
      <p>Customer Payable Total: <b>${formatPrice(payable)}</b></p>
    </div>
  `;

  $("selectedServicesList").querySelectorAll(".remove-selected-btn")
    .forEach(button => {
      button.onclick = () => {
        selectedServices.splice(Number(button.dataset.selectedIndex), 1);
        renderSelectedServices();
      };
    });
}

async function saveOrder() {
  const customerName = $("f_name").value.trim();
  const phone = $("f_phone").value.trim();
  const location = $("f_location").value.trim();

  if (!customerName || !phone || !location) {
    alert("Please complete customer name, phone and location.");
    return;
  }

  if (!selectedServices.length) {
    alert("Please add at least one service.");
    return;
  }

  const button = $("confirmOrder");
  button.disabled = true;
  button.textContent = "Submitting...";

  try {
    await post({
      action: "create",
      customerName,
      phone,
      location,
      services: selectedServices.map(s => ({
        category: s.category,
        name: s.name
      })),
      details: $("f_details").value,
      comments: $("f_comments").value
    });

    await new Promise(resolve => setTimeout(resolve, 1800));
    await refreshAll();
    closeM();
    showPage("orders");
    alert("Order request submitted. Please verify that it appears in Orders.");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Confirm Order";
    alert("Order submission failed: " + error.message);
  }
}

// ---------- Employee management ----------

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
      <button class="primary" id="createEmployeeBtn">Create Account</button>
      <button onclick="closeM()">Cancel</button>
    </div>
  `);

  $("createEmployeeBtn").onclick = saveEmployee;
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

  try {
    await post({
      action: "createEmployee",
      name, email, password, role
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await loadEmployees();
    closeM();
    alert("Employee creation request submitted. Verify the employee list.");
  } catch (error) {
    alert(error.message);
  }
}

async function loadEmployees() {
  const result = await api({ action: "employees" });

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

// ---------- HTML escaping ----------

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
