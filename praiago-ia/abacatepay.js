require('dotenv').config()

const API_BASE = 'https://api.abacatepay.com/v2'

function getToken() {
  const token = process.env.ABACATEPAY_TOKEN
  if (!token) {
    throw new Error('Falta ABACATEPAY_TOKEN no praiago-ia/.env')
  }
  return token
}

async function requestAbacatePay(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.success === false) {
    const message = payload?.error?.message || payload?.message || `AbacatePay HTTP ${response.status}`
    throw new Error(message)
  }

  return payload?.data ?? payload
}

function toCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor do Pix invalido')
  return Math.round(amount * 100)
}

async function createPixCharge({ amount, description, externalId, customer }) {
  return requestAbacatePay('/transparents/create', {
    method: 'POST',
    body: {
      data: {
        amount: toCents(amount),
        description,
        externalId,
        customer,
      },
    },
  })
}

async function checkPixCharge(id) {
  if (!id) throw new Error('Informe o ID do Pix para consultar')
  return requestAbacatePay(`/transparents/check?id=${encodeURIComponent(id)}`)
}

module.exports = {
  createPixCharge,
  checkPixCharge,
}
