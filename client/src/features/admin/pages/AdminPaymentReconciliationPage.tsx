import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { CheckCircleIcon, ShieldIcon } from '../../../components/common/Icons'
import AdminLayout from '../../../components/layout/AdminLayout'
import AdminStatusPanel from '../components/AdminStatusPanel'
import { getAdminRequestError, type AdminRequestError } from '../utils/adminRequestError'
import { useToast } from '../../../context/ToastContext'
import {
  confirmAdminCodPayment,
  fetchPaymentReconciliationCandidates,
  fetchPaymentWebhookEvents,
  reconcileAdminPayment,
  runPaymentReconciliation,
  type PaymentReconciliationCandidate,
  type PaymentReconciliationPage,
  type PaymentReconciliationStatus,
  type PaymentWebhookEvent,
} from '../api'

const PAGE_LIMIT = 50
const EMPTY_VALUE = '—'
const reconciliationStatuses: Array<PaymentReconciliationStatus | ''> = [
  '',
  'PENDING',
  'MATCHED',
  'MISMATCH',
  'UNAVAILABLE',
  'MANUAL_CONFIRMED',
]

const emptyPage: PaymentReconciliationPage = {
  candidates: [],
  pagination: { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 0 },
}

const formatVnd = (value: number | null) =>
  value === null
    ? EMPTY_VALUE
    : new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      }).format(value)

const formatDate = (value: string | null) => {
  if (!value) return EMPTY_VALUE
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

const labelProvider = (provider: string) =>
  provider === 'payos' ? 'PayOS' : provider === 'cash' ? 'COD' : `Legacy / ${provider}`
const labelTarget = (candidate: PaymentReconciliationCandidate) =>
  candidate.orderId
    ? `Order #${candidate.orderId}`
    : candidate.targetType === 'pending_checkout'
      ? `Pending checkout #${candidate.targetId}`
      : `Payment #${candidate.targetId}`
const statusClass = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')

const AdminPaymentReconciliationPage = () => {
  const { addToast } = useToast()
  const [provider, setProvider] = useState<'' | 'cash' | 'payos'>('')
  const [reconciliationStatus, setReconciliationStatus] = useState<'' | PaymentReconciliationStatus>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [paymentPage, setPaymentPage] = useState<PaymentReconciliationPage>(emptyPage)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState<AdminRequestError | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [codNotes, setCodNotes] = useState<Record<number, string>>({})
  const [expandedPaymentId, setExpandedPaymentId] = useState<number | null>(null)
  const [webhookEvents, setWebhookEvents] = useState<Record<number, PaymentWebhookEvent[]>>({})
  const [webhookErrors, setWebhookErrors] = useState<Record<number, string>>({})

  const loadCandidates = useCallback(async () => {
    try {
      setIsLoading(true)
      setLoadError(null)
      const result = await fetchPaymentReconciliationCandidates({
        page: currentPage,
        limit: PAGE_LIMIT,
        ...(provider ? { provider } : {}),
        ...(reconciliationStatus ? { reconciliationStatus } : {}),
      })
      setPaymentPage(result)
      setHasLoaded(true)
    } catch (error) {
      setLoadError(getAdminRequestError(error))
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, provider, reconciliationStatus])

  useEffect(() => {
    void loadCandidates()
  }, [loadCandidates])

  const counts = useMemo(
    () => ({
      total: paymentPage.pagination.total,
      payos: paymentPage.candidates.filter((candidate) => candidate.provider === 'payos').length,
      cash: paymentPage.candidates.filter((candidate) => candidate.provider === 'cash').length,
      attention: paymentPage.candidates.filter((candidate) =>
        ['MISMATCH', 'UNAVAILABLE'].includes(candidate.reconciliationStatus),
      ).length,
    }),
    [paymentPage],
  )

  const runReconciliation = async () => {
    try {
      setBusyAction('run')
      setActionError(null)
      const result = await runPaymentReconciliation(100)
      const matched = result.results.filter((item) => item.outcome === 'MATCHED').length
      addToast('Payments', `${matched} of ${result.results.length} payment checks matched.`)
      await loadCandidates()
    } catch (error) {
      setActionError(getAdminRequestError(error).message)
      addToast('Payments', 'Reconciliation run failed.')
    } finally {
      setBusyAction(null)
    }
  }

  const reconcilePayment = async (candidate: PaymentReconciliationCandidate) => {
    try {
      setBusyAction(`reconcile-${candidate.targetId}`)
      setActionError(null)
      const result = await reconcileAdminPayment(candidate.targetId)
      addToast(
        'Payments',
        result.outcome === 'MATCHED' ? 'Payment matched successfully.' : `Payment check: ${result.outcome}.`,
      )
      await loadCandidates()
    } catch (error) {
      setActionError(getAdminRequestError(error).message)
      addToast('Payments', 'Payment reconciliation failed.')
    } finally {
      setBusyAction(null)
    }
  }

  const confirmCod = async (candidate: PaymentReconciliationCandidate) => {
    try {
      setBusyAction(`cod-${candidate.targetId}`)
      setActionError(null)
      await confirmAdminCodPayment(candidate.targetId, codNotes[candidate.targetId])
      addToast('Payments', 'COD payment marked as collected.')
      await loadCandidates()
    } catch (error) {
      setActionError(getAdminRequestError(error).message)
      addToast('Payments', 'COD confirmation failed.')
    } finally {
      setBusyAction(null)
    }
  }

  const toggleWebhookEvents = async (candidate: PaymentReconciliationCandidate) => {
    if (expandedPaymentId === candidate.targetId) {
      setExpandedPaymentId(null)
      return
    }

    if (webhookEvents[candidate.targetId]) {
      setExpandedPaymentId(candidate.targetId)
      return
    }

    try {
      setBusyAction(`events-${candidate.targetId}`)
      setWebhookErrors((current) => ({ ...current, [candidate.targetId]: '' }))
      const events = await fetchPaymentWebhookEvents(candidate.targetId)
      setWebhookEvents((current) => ({ ...current, [candidate.targetId]: events }))
      setExpandedPaymentId(candidate.targetId)
    } catch (error) {
      setWebhookErrors((current) => ({
        ...current,
        [candidate.targetId]: getAdminRequestError(error).message,
      }))
    } finally {
      setBusyAction(null)
    }
  }

  const hasPreviousPage = currentPage > 1
  const hasNextPage = paymentPage.pagination.totalPages > currentPage

  return (
    <AdminLayout>
      <Helmet>
        <title>Payment reconciliation | Digital-E</title>
        <meta name='description' content='Review and reconcile PayOS and COD payment ledger records.' />
      </Helmet>
      <main className='admin__page admin__page--payments'>
        <header className='admin__page__header'>
          <div>
            <span className='admin__page__eyebrow'>Finance operations</span>
            <h1 className='admin__page__title'>Payment reconciliation</h1>
            <p className='admin__page__subtitle'>
              Match PayOS settlements, confirm COD collection, and trace webhook evidence before fulfilment or support
              decisions.
            </p>
          </div>
          <div className='admin__page__actions'>
            <button
              type='button'
              className='admin__button admin__button--ghost'
              onClick={() => void loadCandidates()}
              disabled={isLoading || busyAction !== null}
            >
              Refresh queue
            </button>
            <button
              type='button'
              className='admin__button admin__button--primary'
              onClick={() => void runReconciliation()}
              disabled={busyAction !== null || isLoading}
            >
              <ShieldIcon size={16} />
              {busyAction === 'run' ? 'Running checks...' : 'Run PayOS checks'}
            </button>
          </div>
        </header>

        {actionError ? (
          <div className='admin__alert' role='alert'>
            {actionError}
          </div>
        ) : null}

        <section className='admin__summary' aria-label='Payment reconciliation summary'>
          <div className='admin__summary-card'>
            <span>Queue total</span>
            <strong>{counts.total}</strong>
            <p>Records requiring review</p>
          </div>
          <div className='admin__summary-card'>
            <span>PayOS in view</span>
            <strong>{counts.payos}</strong>
            <p>Provider lookups available</p>
          </div>
          <div className='admin__summary-card'>
            <span>COD in view</span>
            <strong>{counts.cash}</strong>
            <p>Manual collection review</p>
          </div>
          <div className='admin__summary-card'>
            <span>Needs attention</span>
            <strong>{counts.attention}</strong>
            <p>Mismatch or unavailable</p>
          </div>
        </section>

        <section className='admin__card admin__payments__workspace'>
          <div className='admin__card__header admin__card__header--stacked'>
            <div>
              <h3>Reconciliation queue</h3>
              <span className='admin__payments__scope-note'>
                PayOS and COD prioritized; legacy records retained for audit.
              </span>
              <span aria-live='polite'>{paymentPage.candidates.length} records in this view · VND only</span>
            </div>
            <div className='admin__payments__filters' aria-label='Reconciliation filters'>
              <label>
                <span>Provider</span>
                <select
                  aria-label='Filter by provider'
                  value={provider}
                  onChange={(event) => {
                    setProvider(event.target.value as typeof provider)
                    setCurrentPage(1)
                  }}
                >
                  <option value=''>All providers</option>
                  <option value='payos'>PayOS</option>
                  <option value='cash'>Cash on delivery</option>
                </select>
              </label>
              <label>
                <span>Reconciliation status</span>
                <select
                  aria-label='Filter by reconciliation status'
                  value={reconciliationStatus}
                  onChange={(event) => {
                    setReconciliationStatus(event.target.value as typeof reconciliationStatus)
                    setCurrentPage(1)
                  }}
                >
                  {reconciliationStatuses.map((status) => (
                    <option key={status || 'all'} value={status}>
                      {status || 'All statuses'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loadError && !hasLoaded ? (
            <AdminStatusPanel
              variant='error'
              title='Reconciliation unavailable'
              description={loadError.message}
              onRetry={() => void loadCandidates()}
            />
          ) : isLoading && !hasLoaded ? (
            <AdminStatusPanel
              variant='loading'
              title='Loading reconciliation queue'
              description='Fetching payment ledger candidates and their latest local state.'
            />
          ) : paymentPage.candidates.length === 0 ? (
            <AdminStatusPanel
              variant='empty'
              title='Reconciliation queue is clear'
              description='No payment records match the current filters.'
            />
          ) : (
            <>
              <div className='admin__table-wrap admin__payments__table-wrap' aria-busy={isLoading}>
                <p className='admin__payments__table-hint'>Swipe horizontally to compare payment evidence.</p>
                <table className='admin__table admin__payments__table'>
                  <caption className='admin__sr-only'>Payment reconciliation queue</caption>
                  <thead>
                    <tr>
                      <th scope='col'>Payment</th>
                      <th scope='col'>Provider</th>
                      <th scope='col'>Payment status</th>
                      <th scope='col' className='admin__payments__numeric-heading'>
                        Expected amount
                      </th>
                      <th scope='col'>Provider result</th>
                      <th scope='col'>Last event</th>
                      <th scope='col'>Mismatch reason</th>
                      <th scope='col'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentPage.candidates.map((candidate) => {
                      const isOrderPayment = candidate.targetType === 'order_payment'
                      const isCod = candidate.provider === 'cash'
                      const isCodConfirmed = candidate.reconciliationStatus === 'MANUAL_CONFIRMED'
                      const canConfirmCod =
                        isCod &&
                        isOrderPayment &&
                        !isCodConfirmed &&
                        ['pending', 'paid'].includes(candidate.localStatus.toLowerCase())
                      const canReconcile = candidate.provider === 'payos' && isOrderPayment
                      const rowBusy =
                        busyAction === `reconcile-${candidate.targetId}` || busyAction === `cod-${candidate.targetId}`
                      const hasVisibleAction = canReconcile || canConfirmCod || isOrderPayment
                      return (
                        <React.Fragment key={`${candidate.targetType}-${candidate.targetId}`}>
                          <tr>
                            <td>
                              <div className='admin__table__stack'>
                                <strong>{labelTarget(candidate)}</strong>
                              </div>
                            </td>
                            <td>
                              <span className='admin__payments__provider'>{labelProvider(candidate.provider)}</span>
                            </td>
                            <td>
                              <div className='admin__table__stack admin__payments__status'>
                                <span className={`admin__pill admin__pill--${statusClass(candidate.localStatus)}`}>
                                  {candidate.localStatus}
                                </span>
                                <small>Reconciliation: {candidate.reconciliationStatus}</small>
                              </div>
                            </td>
                            <td className='admin__payments__amount-cell'>
                              <div className='admin__table__stack admin__payments__amount'>
                                <strong>{formatVnd(candidate.expectedAmount)}</strong>
                              </div>
                            </td>
                            <td>
                              <div className='admin__payments__evidence'>
                                {candidate.providerAmount !== null || candidate.providerStatus ? (
                                  <>
                                    <strong>
                                      {candidate.providerAmount === null
                                        ? candidate.providerStatus
                                        : formatVnd(candidate.providerAmount)}
                                    </strong>
                                    {candidate.providerAmount !== null && candidate.providerStatus ? (
                                      <small>{candidate.providerStatus}</small>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className='admin__payments__empty'>Not checked</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className='admin__payments__evidence'>
                                {candidate.lastEventStatus || candidate.lastEventAt ? (
                                  <>
                                    <strong>{candidate.lastEventStatus || 'Event received'}</strong>
                                    {candidate.lastEventAt ? <small>{formatDate(candidate.lastEventAt)}</small> : null}
                                  </>
                                ) : (
                                  <span className='admin__payments__empty'>No event</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <p>{candidate.mismatchReason || EMPTY_VALUE}</p>
                            </td>
                            <td>
                              <div className='admin__table__actions admin__payments__actions'>
                                {canReconcile ? (
                                  <button
                                    type='button'
                                    className='admin__button admin__button--primary admin__button--compact'
                                    onClick={() => void reconcilePayment(candidate)}
                                    disabled={busyAction !== null}
                                  >
                                    {rowBusy ? 'Checking...' : 'Reconcile'}
                                  </button>
                                ) : null}
                                {canConfirmCod ? (
                                  <>
                                    <label className='admin__payments__note'>
                                      <span className='admin__sr-only'>COD note for payment {candidate.targetId}</span>
                                      <input
                                        aria-label={`COD note for payment ${candidate.targetId}`}
                                        value={codNotes[candidate.targetId] || ''}
                                        onChange={(event) =>
                                          setCodNotes((current) => ({
                                            ...current,
                                            [candidate.targetId]: event.target.value,
                                          }))
                                        }
                                        placeholder='Optional audit note'
                                        maxLength={500}
                                      />
                                    </label>
                                    <button
                                      type='button'
                                      className='admin__button admin__button--success admin__button--compact'
                                      onClick={() => void confirmCod(candidate)}
                                      disabled={busyAction !== null}
                                    >
                                      {rowBusy ? 'Confirming...' : 'Confirm COD'}
                                    </button>
                                  </>
                                ) : isCodConfirmed ? (
                                  <span className='admin__pill admin__pill--success'>
                                    <CheckCircleIcon size={13} />
                                    Collected
                                  </span>
                                ) : null}
                                {isOrderPayment ? (
                                  <button
                                    type='button'
                                    className='admin__button admin__button--ghost admin__button--compact'
                                    onClick={() => void toggleWebhookEvents(candidate)}
                                    disabled={busyAction !== null}
                                  >
                                    {busyAction === `events-${candidate.targetId}`
                                      ? 'Loading...'
                                      : expandedPaymentId === candidate.targetId
                                        ? 'Hide events'
                                        : 'Webhook events'}
                                  </button>
                                ) : null}
                                {!canReconcile &&
                                !canConfirmCod &&
                                !isCodConfirmed &&
                                candidate.targetType === 'pending_checkout' ? (
                                  <small className='admin__payments__action-note'>
                                    Run queue check to process this reservation.
                                  </small>
                                ) : null}
                                {!hasVisibleAction && candidate.targetType !== 'pending_checkout' ? (
                                  <span className='admin__payments__no-action'>Audit only</span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {expandedPaymentId === candidate.targetId ? (
                            <tr className='admin__payments__events-row'>
                              <td colSpan={8}>
                                <div
                                  className='admin__payments__events'
                                  aria-label={`Webhook history for payment ${candidate.targetId}`}
                                >
                                  <div>
                                    <strong>Webhook history</strong>
                                    <span>{webhookEvents[candidate.targetId]?.length || 0} events</span>
                                  </div>
                                  {webhookErrors[candidate.targetId] ? (
                                    <p className='admin__payments__event-error' role='alert'>
                                      {webhookErrors[candidate.targetId]}
                                    </p>
                                  ) : null}
                                  {webhookEvents[candidate.targetId]?.length ? (
                                    webhookEvents[candidate.targetId].map((event) => (
                                      <WebhookEventRow key={event.id} event={event} />
                                    ))
                                  ) : (
                                    <span>No webhook events are linked to this payment.</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {loadError && hasLoaded ? (
                <AdminStatusPanel
                  variant='error'
                  title='Refresh failed'
                  description={loadError.message}
                  onRetry={() => void loadCandidates()}
                  retryLabel='Retry refresh'
                />
              ) : null}
              <div className='admin__payments__pagination' aria-label='Reconciliation pagination'>
                <span>
                  Page {paymentPage.pagination.page} of {Math.max(paymentPage.pagination.totalPages, 1)}
                </span>
                <div>
                  <button
                    type='button'
                    className='admin__button admin__button--ghost admin__button--compact'
                    onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
                    disabled={!hasPreviousPage || isLoading}
                  >
                    Previous
                  </button>
                  <button
                    type='button'
                    className='admin__button admin__button--ghost admin__button--compact'
                    onClick={() => setCurrentPage((value) => value + 1)}
                    disabled={!hasNextPage || isLoading}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </AdminLayout>
  )
}

const WebhookEventRow = ({ event }: { event: PaymentWebhookEvent }) => (
  <article className='admin__payments__event'>
    <div>
      <strong>{event.eventType}</strong>
      <span className={`admin__pill admin__pill--${statusClass(event.status)}`}>{event.status}</span>
    </div>
    <p>{event.lastError || 'No processing error recorded.'}</p>
    <small>
      {formatDate(event.receivedAt)} · Attempt {event.attemptCount}
    </small>
  </article>
)

export default AdminPaymentReconciliationPage
