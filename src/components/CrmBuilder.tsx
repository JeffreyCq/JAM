import React, { useState, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldRow {
  id: string; enabled: boolean; leadPath: string
  defaultApiName: string; apiName: string; category: string; note?: string
}
interface HeaderRow  { id: string; key: string; value: string }
interface StaticRow  { id: string; key: string; value: string }
interface TransformRow {
  id: string; varName: string; source: string
  format: string; customFormat: string; apiName: string
}

/** One HTTP call in the _actions chain */
interface HttpStep {
  id: string
  label: string        // display label
  actionId: string     // variable name used in templates, e.g. "create_contact"
  urlFieldName: string // config key for the URL, e.g. "url" or "contact_url"
  method: 'POST' | 'GET' | 'PUT' | 'PATCH'
  payloadType: 'json' | 'form'
  responseType: 'json' | 'plain'
  /** Step 1: body is built from the global lead-field catalogue (Section 4).
   *  Steps 2+: body is built from explicit bodyEntries. */
  useGlobalFields: boolean
  bodyEntries: BodyEntry[]  // used when useGlobalFields = false
}

/** A single key→value pair in a step's body_data */
interface BodyEntry {
  id: string
  apiName: string  // key in body_data
  value: string    // template value, e.g. "{{ create_contact.data.id }}"
}

interface Checker {
  statusCodes: string; bodyExists: boolean; bodyContains: string
  useDataField: boolean; dataField: string; dataValue: string
  stepActionId: string  // which step's response to check
}

// ─── Catalogues ───────────────────────────────────────────────────────────────

const FIELD_CATALOGUE: Omit<FieldRow, 'id' | 'enabled' | 'apiName'>[] = [
  // Lead · Basic
  { leadPath: 'd.lead.id',                                    defaultApiName: 'leadId',             category: 'Lead · Basic' },
  { leadPath: 'd.lead.uuid',                                  defaultApiName: 'externalLeadID',     category: 'Lead · Basic' },
  { leadPath: 'd.lead.first_name',                            defaultApiName: 'firstName',          category: 'Lead · Basic' },
  { leadPath: 'd.lead.last_name',                             defaultApiName: 'lastName',           category: 'Lead · Basic' },
  { leadPath: 'd.lead.full_name',                             defaultApiName: 'fullName',           category: 'Lead · Basic' },
  { leadPath: 'd.lead.email',                                 defaultApiName: 'email',              category: 'Lead · Basic' },
  { leadPath: 'd.lead.phone_number',                          defaultApiName: 'phone',              category: 'Lead · Basic' },
  { leadPath: 'd.lead.zip_code',                              defaultApiName: 'zip',                category: 'Lead · Basic' },
  { leadPath: 'd.lead.is_out_of_area',                        defaultApiName: 'isOutOfArea',        category: 'Lead · Basic' },
  // Lead · Service & Campaign
  { leadPath: 'd.lead.service_id',                            defaultApiName: 'serviceId',          category: 'Lead · Service' },
  { leadPath: 'd.lead.service_alias',                         defaultApiName: 'serviceAlias',       category: 'Lead · Service' },
  { leadPath: 'd.lead.service_name',                          defaultApiName: 'taskName',           category: 'Lead · Service' },
  { leadPath: 'd.lead.campaign_id',                           defaultApiName: 'campaignId',         category: 'Lead · Service' },
  { leadPath: 'd.lead.campaign_alias',                        defaultApiName: 'campaignAlias',      category: 'Lead · Service' },
  { leadPath: 'd.lead.campaign_name',                         defaultApiName: 'campaignName',       category: 'Lead · Service' },
  // Lead · Contractor
  { leadPath: 'd.lead.contractor_id',                         defaultApiName: 'contractorId',       category: 'Lead · Contractor' },
  { leadPath: 'd.lead.contractor_full_name',                  defaultApiName: 'contractorName',     category: 'Lead · Contractor' },
  { leadPath: 'd.lead.contractor_company_name',               defaultApiName: 'contractorCompany',  category: 'Lead · Contractor' },
  // Lead · Dates
  { leadPath: 'd.lead.created_at',                            defaultApiName: 'createdAt',          category: 'Lead · Dates' },
  { leadPath: 'd.lead.updated_at',                            defaultApiName: 'updatedAt',          category: 'Lead · Dates' },
  { leadPath: 'd.lead.created_at_unix_timestamp',             defaultApiName: 'createdAtTs',        category: 'Lead · Dates', note: 'unix ts' },
  { leadPath: 'd.lead.updated_at_unix_timestamp',             defaultApiName: 'updatedAtTs',        category: 'Lead · Dates', note: 'unix ts' },
  { leadPath: 'd.lead.appointment_set_at',                    defaultApiName: 'appointmentAt',      category: 'Lead · Dates' },
  { leadPath: 'd.lead.appointment_set_at_unix_timestamp',     defaultApiName: 'appointmentAtTs',    category: 'Lead · Dates', note: 'unix ts' },
  // Address
  { leadPath: 'd.lead_address.address',                       defaultApiName: 'address',            category: 'Address' },
  { leadPath: 'd.lead_address.city',                          defaultApiName: 'city',               category: 'Address' },
  { leadPath: 'd.lead_address.state_code',                    defaultApiName: 'state',              category: 'Address', note: 'abbreviated' },
  { leadPath: 'd.lead_address.state',                         defaultApiName: 'stateFull',          category: 'Address', note: 'full name' },
  { leadPath: 'd.lead_address.country_code',                  defaultApiName: 'country',            category: 'Address', note: '2-letter' },
  { leadPath: 'd.lead_address.country',                       defaultApiName: 'countryFull',        category: 'Address', note: 'full name' },
  // Other
  { leadPath: 'd.lead_description',                           defaultApiName: 'notes',              category: 'Other' },
  { leadPath: 'd.lead_billing.price',                         defaultApiName: 'fee',                category: 'Other' },
  { leadPath: 'd.lead_billing.currency',                      defaultApiName: 'currency',           category: 'Other' },
  // Compliance
  { leadPath: 'd.lead_metadata.trusted_form_url',             defaultApiName: 'trustedFormUrl',     category: 'Compliance' },
  { leadPath: 'd.lead_metadata.trusted_form_cert_id',         defaultApiName: 'trustedFormId',      category: 'Compliance' },
  { leadPath: 'd.lead_metadata.jornaya_lead_id',              defaultApiName: 'jornayaLeadId',      category: 'Compliance' },
  { leadPath: 'd.lead_metadata.landing_page_url',             defaultApiName: 'landingPageUrl',     category: 'Compliance' },
  // UTM / Query
  { leadPath: 'd.lead_metadata.query_data.source',            defaultApiName: 'source',             category: 'UTM / Query' },
  { leadPath: 'd.lead_metadata.query_data.mb',                defaultApiName: 'mb',                 category: 'UTM / Query' },
  { leadPath: 'd.lead_metadata.utm_content_leafh',            defaultApiName: 'utmContent',         category: 'UTM / Query' },
  { leadPath: 'd.lead_metadata.browser_data.user_ip',         defaultApiName: 'ip',                 category: 'UTM / Query' },
  // Providers
  { leadPath: 'd.ads.platform',                               defaultApiName: 'adsPlatform',        category: 'Providers', note: 'needs ads' },
  { leadPath: 'd.lead_form_data.address',                     defaultApiName: 'formAddress',        category: 'Providers', note: 'needs form_data' },
]

const HEADER_PRESETS = [
  { label: 'Bearer Token',       key: 'Authorization',              value: 'Bearer {{ config.api_key }}' },
  { label: 'x-api-key',          key: 'x-api-key',                  value: '{{ config.api_key }}' },
  { label: 'Accept JSON',        key: 'Accept',                     value: 'application/json' },
  { label: 'Content-Type JSON',  key: 'Content-Type',               value: 'application/json' },
  { label: 'x-functions-key',    key: 'x-functions-key',            value: '{{ config.api_key }}' },
  { label: 'Ocp-Apim-Key',       key: 'Ocp-Apim-Subscription-Key', value: '{{ config.api_key }}' },
]

const DATE_SOURCES = [
  { value: 'd.lead.created_at_unix_timestamp',         label: 'created_at (unix)' },
  { value: 'd.lead.updated_at_unix_timestamp',         label: 'updated_at (unix)' },
  { value: 'd.lead.appointment_set_at_unix_timestamp', label: 'appointment_set_at (unix)' },
]

const DATE_FORMATS = [
  { value: "date('Y-m-d', SOURCE)",                                               label: "Y-m-d  →  2025-04-26" },
  { value: "date('m/d/Y H:i:s', SOURCE)",                                         label: "m/d/Y H:i:s  →  04/26/2025 14:30:00" },
  { value: "date('Y/m/d H:i:s', SOURCE)",                                         label: "Y/m/d H:i:s  →  2025/04/26 14:30:00" },
  { value: "date('M/d/y H:m:s', SOURCE)",                                         label: "M/d/y H:m:s  →  Apr/26/25 14:30" },
  { value: "date_format(date_create_from_format('U', SOURCE), 'm/d/Y H:i:s')",    label: "m/d/Y H:i:s  (alt)" },
  { value: 'custom',                                                               label: "Custom expression…" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _n = 0
const uid = () => `_${++_n}`

function toAlias(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return slug ? `crm_constructor_${slug}` : 'crm_constructor_'
}

function toActionId(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'step'
}

function makeStep(n: number): HttpStep {
  return {
    id: uid(), label: n === 1 ? 'Send Lead' : `Step ${n}`,
    actionId: n === 1 ? 'send' : `step_${n}`,
    urlFieldName: n === 1 ? 'url' : `url_step${n}`,
    method: 'POST', payloadType: 'json', responseType: 'json',
    useGlobalFields: n === 1,
    bodyEntries: [],
  }
}

function buildExpression(checker: Checker): string {
  const id = checker.stepActionId || 'send'
  const parts: string[] = []
  const codes = checker.statusCodes.split(',').map(s => s.trim()).filter(Boolean)
  if (codes.length === 1)      parts.push(`${id}.status == ${codes[0]}`)
  else if (codes.length > 1)   parts.push('(' + codes.map(c => `${id}.status == ${c}`).join(' || ') + ')')
  if (checker.bodyContains)    parts.push(`${id}.body contains '${checker.bodyContains}'`)
  else if (checker.bodyExists) parts.push(`${id}.body`)
  if (checker.useDataField && checker.dataField)
    parts.push(`${id}.data.${checker.dataField} == '${checker.dataValue}'`)
  return parts.join(' && ') || `${id}.status == 200`
}

function generateScript(p: {
  addApiKeyField: boolean; apiKeyFieldName: string
  headers: HeaderRow[]; fields: FieldRow[]; staticFields: StaticRow[]
  transforms: TransformRow[]; providers: { form_data: boolean; ads: boolean; uuid_in_description: boolean }
  steps: HttpStep[]; checker: Checker
}): string {
  const script: Record<string, unknown> = {}

  // One URL field per step
  for (const step of p.steps) {
    if (step.urlFieldName.trim()) script[step.urlFieldName.trim()] = ''
  }

  // API key
  if (p.addApiKeyField && p.apiKeyFieldName.trim()) script[p.apiKeyFieldName.trim()] = ''

  // Static config
  for (const s of p.staticFields) if (s.key.trim()) script[s.key.trim()] = s.value

  // Lead fields used by global steps
  const transformApiNames = new Set(p.transforms.map(t => t.apiName.trim()).filter(Boolean))
  for (const f of p.fields.filter(f => f.enabled)) {
    if (!transformApiNames.has(f.apiName)) script[f.apiName] = `{{ ${f.leadPath} }}`
  }

  // Lead fields referenced by non-global step body entries (add them to config too)
  for (const step of p.steps.filter(s => !s.useGlobalFields)) {
    for (const e of step.bodyEntries) {
      // If the value looks like {{ config.xxx }}, ensure xxx is in the catalogue
      const m = e.value.match(/\{\{\s*config\.(\w+)\s*\}\}/)
      if (m) {
        const apiName = m[1]
        if (!(apiName in script)) {
          const cat = p.fields.find(f => f.apiName === apiName)
          if (cat) script[apiName] = `{{ ${cat.leadPath} }}`
        }
      }
    }
  }

  // _providers
  if (p.providers.form_data || p.providers.ads || p.providers.uuid_in_description) {
    const pr: Record<string, boolean> = {}
    if (p.providers.form_data) pr.form_data = true
    if (p.providers.ads) pr.ads = true
    if (p.providers.uuid_in_description) pr.uuid_in_description = true
    script._providers = pr
  }

  // _actions
  const actions: unknown[] = []
  let pos = 1

  // Date transforms
  for (const t of p.transforms) {
    if (!t.varName.trim() || !t.apiName.trim()) continue
    const expr = t.format === 'custom' ? t.customFormat : t.format.replace('SOURCE', t.source)
    actions.push({ position: pos++, id: 'logic_var_set', action_id: t.varName.trim(), config: { if: 'true', then: expr } })
  }

  // Global headers
  const validHeaders = p.headers.filter(h => h.key.trim() && h.value.trim())
  const hdrsObj = validHeaders.length > 0
    ? Object.fromEntries(validHeaders.map(h => [h.key.trim(), h.value.trim()]))
    : null

  // HTTP steps
  for (const step of p.steps) {
    const cfg: Record<string, unknown> = {
      method: step.method,
      url: `{{ config.${step.urlFieldName.trim() || 'url'} }}`,
      payload_type: step.payloadType,
      response_type: step.responseType,
    }
    if (hdrsObj) cfg.headers = hdrsObj

    const body: Record<string, string> = {}
    if (step.useGlobalFields) {
      for (const f of p.fields.filter(f => f.enabled)) {
        const tr = p.transforms.find(t => t.apiName.trim() === f.apiName)
        body[f.apiName] = tr ? `{{ ${tr.varName.trim()}.result }}` : `{{ config.${f.apiName} }}`
      }
      for (const t of p.transforms) {
        if (!t.apiName.trim() || !t.varName.trim()) continue
        if (!(t.apiName.trim() in body)) body[t.apiName.trim()] = `{{ ${t.varName.trim()}.result }}`
      }
      for (const s of p.staticFields) {
        if (s.key.trim() && !(s.key.trim() in body)) body[s.key.trim()] = `{{ config.${s.key.trim()} }}`
      }
    } else {
      for (const e of step.bodyEntries) {
        if (e.apiName.trim()) body[e.apiName.trim()] = e.value
      }
    }
    cfg.body_data = body
    actions.push({ position: pos++, id: 'http', action_id: step.actionId, config: cfg })
  }

  // Delivery checker
  const lastStep = p.steps[p.steps.length - 1]
  const checkerRef = p.checker.stepActionId || lastStep?.actionId || 'send'
  actions.push({
    position: pos++, id: 'delivery_checker', action_id: 'send_check',
    config: { expression: buildExpression({ ...p.checker, stepActionId: checkerRef }) },
  })

  script._actions = actions
  return JSON.stringify(script, null, 2)
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cb-card">
      <div className="cb-card__title">{title}</div>
      <div className="cb-card__body">{children}</div>
    </div>
  )
}

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="cb-form-row">
      <div className="cb-form-row__label">{label}{hint && <span className="cb-hint"> — {hint}</span>}</div>
      <div className="cb-form-row__ctrl">{children}</div>
    </div>
  )
}

function ToggleGroup<T extends string>({ options, value, onChange }: {
  options: T[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="cb-btn-group">
      {options.map(o => (
        <button key={o} className={`cb-tog${value === o ? ' cb-tog--on' : ''}`} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  )
}

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({ step, index, total, fields, prevSteps, onChange, onRemove, onMove }: {
  step: HttpStep; index: number; total: number
  fields: FieldRow[]; prevSteps: HttpStep[]
  onChange: (patch: Partial<HttpStep>) => void
  onRemove: () => void; onMove: (dir: -1 | 1) => void
}) {
  const addEntry = () => onChange({ bodyEntries: [...step.bodyEntries, { id: uid(), apiName: '', value: '' }] })
  const removeEntry = (id: string) => onChange({ bodyEntries: step.bodyEntries.filter(e => e.id !== id) })
  const updateEntry = (id: string, k: 'apiName' | 'value', v: string) =>
    onChange({ bodyEntries: step.bodyEntries.map(e => e.id === id ? { ...e, [k]: v } : e) })

  const addLeadRef = (f: FieldRow) => {
    const val = `{{ config.${f.apiName} }}`
    onChange({ bodyEntries: [...step.bodyEntries, { id: uid(), apiName: f.apiName, value: val }] })
  }

  const addStepRef = (prevStep: HttpStep) => {
    onChange({ bodyEntries: [...step.bodyEntries, { id: uid(), apiName: '', value: `{{ ${prevStep.actionId}.data. }}` }] })
  }

  return (
    <div className="cb-step-card">
      <div className="cb-step-card__header">
        <span className="cb-step-badge">Step {index + 1}</span>
        <input
          className="cb-input cb-step-label"
          value={step.label}
          onChange={e => onChange({ label: e.target.value, actionId: toActionId(e.target.value) })}
          placeholder="Step label"
        />
        <code className="cb-step-id">{step.actionId}</code>
        <div className="cb-step-actions">
          {index > 0 && <button className="cb-icon-btn" onClick={() => onMove(-1)} title="Move up">↑</button>}
          {index < total - 1 && <button className="cb-icon-btn" onClick={() => onMove(1)} title="Move down">↓</button>}
          {total > 1 && <button className="cb-icon-btn cb-icon-btn--danger" onClick={onRemove} title="Remove step">✕</button>}
        </div>
      </div>

      <div className="cb-step-card__body">
        <div className="cb-step-row">
          <label className="cb-step-row__label">URL config field</label>
          <input className="cb-input" style={{ width: 160 }} value={step.urlFieldName}
            onChange={e => onChange({ urlFieldName: e.target.value })} placeholder="url" />
          <span className="cb-hint" style={{ marginLeft: 6 }}>→ config.{step.urlFieldName || 'url'}</span>
        </div>

        <div className="cb-step-row">
          <label className="cb-step-row__label">Method</label>
          <ToggleGroup options={['POST', 'GET', 'PUT', 'PATCH']} value={step.method} onChange={v => onChange({ method: v })} />
        </div>

        <div className="cb-step-row">
          <label className="cb-step-row__label">Payload / Response</label>
          <ToggleGroup options={['json', 'form']} value={step.payloadType} onChange={v => onChange({ payloadType: v })} />
          <span className="cb-hint" style={{ margin: '0 8px' }}>/</span>
          <ToggleGroup options={['json', 'plain']} value={step.responseType} onChange={v => onChange({ responseType: v })} />
        </div>

        {step.useGlobalFields ? (
          <div className="cb-step-note">
            📋 Body fields come from <strong>Section 4 — Lead Data Fields</strong>
          </div>
        ) : (
          <div className="cb-step-body-builder">
            <div className="cb-step-body-header">Body fields</div>

            {step.bodyEntries.length > 0 && (
              <div className="cb-kv-list">
                {step.bodyEntries.map(e => (
                  <div key={e.id} className="cb-kv-row">
                    <input className="cb-input" style={{ flex: '0 0 140px' }} value={e.apiName}
                      onChange={ev => updateEntry(e.id, 'apiName', ev.target.value)} placeholder="field name" />
                    <span className="cb-arrow">→</span>
                    <input className="cb-input" style={{ flex: 1 }} value={e.value}
                      onChange={ev => updateEntry(e.id, 'value', ev.target.value)}
                      placeholder='{{ create_contact.data.id }}' />
                    <button className="cb-remove-btn" onClick={() => removeEntry(e.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="cb-step-body-btns">
              {/* Quick-add from lead catalogue */}
              <div className="cb-dropdown-wrap">
                <select className="cb-select" defaultValue=""
                  onChange={e => { const f = fields.find(x => x.id === e.target.value); if (f) addLeadRef(f); e.target.value = '' }}>
                  <option value="" disabled>+ Lead field</option>
                  {Object.entries(
                    fields.reduce<Record<string, FieldRow[]>>((a, f) => { (a[f.category] ??= []).push(f); return a }, {})
                  ).map(([cat, fs]) => (
                    <optgroup key={cat} label={cat}>
                      {fs.map(f => <option key={f.id} value={f.id}>{f.leadPath}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Quick-add from previous steps */}
              {prevSteps.length > 0 && (
                <div className="cb-dropdown-wrap">
                  <select className="cb-select" defaultValue=""
                    onChange={e => { const s = prevSteps.find(x => x.id === e.target.value); if (s) addStepRef(s); e.target.value = '' }}>
                    <option value="" disabled>+ Step result</option>
                    {prevSteps.map(s => (
                      <option key={s.id} value={s.id}>{`{{ ${s.actionId}.data.??? }}`}</option>
                    ))}
                  </select>
                </div>
              )}

              <button className="cb-add-btn" onClick={addEntry}>+ Manual</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CrmBuilder({ onLoadInEditor }: { onLoadInEditor: (json: string) => void }) {
  // 1 · Basic
  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [autoAlias, setAutoAlias] = useState(true)

  // 2 · HTTP Steps
  const [steps, setSteps] = useState<HttpStep[]>([makeStep(1)])

  // 3 · Auth & headers
  const [addApiKeyField, setAddApiKeyField] = useState(false)
  const [apiKeyFieldName, setApiKeyFieldName] = useState('api_key')
  const [headers, setHeaders] = useState<HeaderRow[]>([])

  // 4 · Lead fields
  const [fields, setFields] = useState<FieldRow[]>(() =>
    FIELD_CATALOGUE.map(f => ({
      ...f, id: uid(),
      enabled: ['d.lead.first_name','d.lead.last_name','d.lead.email','d.lead.phone_number','d.lead.zip_code'].includes(f.leadPath),
      apiName: f.defaultApiName,
    }))
  )

  // 5 · Static config
  const [staticFields, setStaticFields] = useState<StaticRow[]>([])

  // 6 · Providers
  const [providers, setProviders] = useState({ form_data: false, ads: false, uuid_in_description: false })

  // 7 · Date transforms
  const [transforms, setTransforms] = useState<TransformRow[]>([])

  // 8 · Delivery checker
  const [checker, setChecker] = useState<Checker>({
    statusCodes: '200', bodyExists: false, bodyContains: '',
    useDataField: false, dataField: '', dataValue: '', stepActionId: 'send',
  })

  const [copied, setCopied] = useState(false)

  // ── Step handlers ─────────────────────────────────────────────────────────────

  const addStep = () => {
    const n = steps.length + 1
    setSteps(ss => [...ss, makeStep(n)])
  }

  const removeStep = (id: string) => setSteps(ss => ss.filter(s => s.id !== id))

  const updateStep = (id: string, patch: Partial<HttpStep>) =>
    setSteps(ss => ss.map(s => s.id === id ? { ...s, ...patch } : s))

  const moveStep = (id: string, dir: -1 | 1) => {
    setSteps(ss => {
      const i = ss.findIndex(s => s.id === id)
      const j = i + dir
      if (j < 0 || j >= ss.length) return ss
      const next = [...ss]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // ── Header handlers ───────────────────────────────────────────────────────────

  const addHeader = () => setHeaders(h => [...h, { id: uid(), key: '', value: '' }])
  const removeHeader = (id: string) => setHeaders(h => h.filter(x => x.id !== id))
  const updateHeader = (id: string, k: 'key' | 'value', v: string) =>
    setHeaders(h => h.map(x => x.id === id ? { ...x, [k]: v } : x))
  const applyPreset = (p: typeof HEADER_PRESETS[0]) => {
    setHeaders(h => [...h, { id: uid(), key: p.key, value: p.value }])
    if (/key|auth|token/i.test(p.key)) setAddApiKeyField(true)
  }

  // ── Field handlers ────────────────────────────────────────────────────────────

  const toggleField = (id: string) => setFields(fs => fs.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f))
  const updateApiName = (id: string, v: string) => setFields(fs => fs.map(f => f.id === id ? { ...f, apiName: v } : f))

  // ── Static handlers ───────────────────────────────────────────────────────────

  const addStatic = () => setStaticFields(s => [...s, { id: uid(), key: '', value: '' }])
  const removeStatic = (id: string) => setStaticFields(s => s.filter(x => x.id !== id))
  const updateStatic = (id: string, k: 'key' | 'value', v: string) =>
    setStaticFields(s => s.map(x => x.id === id ? { ...x, [k]: v } : x))

  // ── Transform handlers ────────────────────────────────────────────────────────

  const addTransform = () => setTransforms(t => [...t, {
    id: uid(), varName: 'date_var', source: 'd.lead.created_at_unix_timestamp',
    format: "date('Y-m-d', SOURCE)", customFormat: '', apiName: '',
  }])
  const removeTransform = (id: string) => setTransforms(t => t.filter(x => x.id !== id))
  const updateTransform = (id: string, k: keyof TransformRow, v: string) =>
    setTransforms(t => t.map(x => x.id === id ? { ...x, [k]: v } : x))

  // ── Name/alias ────────────────────────────────────────────────────────────────

  const handleNameChange = (v: string) => {
    setName(v)
    if (autoAlias) setAlias(toAlias(v))
  }

  // ── Live JSON ─────────────────────────────────────────────────────────────────

  const json = useMemo(() => generateScript({
    addApiKeyField, apiKeyFieldName, headers, fields, staticFields, transforms, providers, steps, checker,
  }), [addApiKeyField, apiKeyFieldName, headers, fields, staticFields, transforms, providers, steps, checker])

  const exprPreview = useMemo(() => buildExpression(checker), [checker])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  // ── Field groups ──────────────────────────────────────────────────────────────

  const byCategory = fields.reduce<Record<string, FieldRow[]>>((acc, f) => {
    ;(acc[f.category] ??= []).push(f); return acc
  }, {})

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="crm-builder">

      {/* ── Left: form ── */}
      <div className="crm-builder__form">

        {/* 1 · Basic Information */}
        <Card title="1 · Basic Information">
          <FormRow label="Integration Name">
            <input className="cb-input" value={name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Bath Fitter CRM-C" />
          </FormRow>
          <FormRow label="Alias">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="cb-input" value={alias}
                onChange={e => { setAlias(e.target.value); setAutoAlias(false) }} placeholder="crm_constructor_..." />
              {!autoAlias && (
                <button className="cb-link-btn" onClick={() => { setAlias(toAlias(name)); setAutoAlias(true) }}>↺ reset</button>
              )}
            </div>
          </FormRow>
        </Card>

        {/* 2 · HTTP Steps */}
        <Card title="2 · HTTP Steps">
          <p className="cb-hint" style={{ marginBottom: 10 }}>
            Most integrations use one step. Add extra steps for multi-call flows (e.g. create contact → create job).
          </p>

          {steps.map((step, i) => (
            <StepCard
              key={step.id}
              step={step} index={i} total={steps.length}
              fields={fields}
              prevSteps={steps.slice(0, i)}
              onChange={patch => updateStep(step.id, patch)}
              onRemove={() => removeStep(step.id)}
              onMove={dir => moveStep(step.id, dir)}
            />
          ))}

          <button className="cb-add-btn" style={{ marginTop: 8 }} onClick={addStep}>
            + Add Step
          </button>
        </Card>

        {/* 3 · Authentication & Headers */}
        <Card title="3 · Authentication & Headers">
          <div className="cb-presets">
            <span className="cb-hint" style={{ marginRight: 4 }}>Quick add:</span>
            {HEADER_PRESETS.map(p => (
              <button key={p.label} className="cb-preset-btn" onClick={() => applyPreset(p)}>{p.label}</button>
            ))}
          </div>

          {headers.length > 0 && (
            <div className="cb-kv-list" style={{ marginTop: 8 }}>
              {headers.map(h => (
                <div key={h.id} className="cb-kv-row">
                  <input className="cb-input" style={{ flex: '0 0 180px' }} value={h.key}
                    onChange={e => updateHeader(h.id, 'key', e.target.value)} placeholder="Header name" />
                  <input className="cb-input" style={{ flex: 1 }} value={h.value}
                    onChange={e => updateHeader(h.id, 'value', e.target.value)} placeholder="Value or {{ config.field }}" />
                  <button className="cb-remove-btn" onClick={() => removeHeader(h.id)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button className="cb-add-btn" onClick={addHeader}>+ Add header</button>
            <label className="cb-check-label">
              <input type="checkbox" checked={addApiKeyField} onChange={e => setAddApiKeyField(e.target.checked)} />
              Include API key as config field:
            </label>
            <input className="cb-input" style={{ width: 110 }} value={apiKeyFieldName}
              onChange={e => setApiKeyFieldName(e.target.value)} disabled={!addApiKeyField} placeholder="api_key" />
          </div>
        </Card>

        {/* 4 · Lead Data Fields */}
        <Card title="4 · Lead Data Fields">
          <p className="cb-hint" style={{ marginBottom: 10 }}>
            Select which lead fields to include. Rename the API field name to match what the endpoint expects.
            These fields are automatically included in Step 1's body.
          </p>
          {Object.entries(byCategory).map(([cat, catFields]) => (
            <div key={cat} className="cb-field-group">
              <div className="cb-field-group__label">{cat}</div>
              {catFields.map(f => (
                <div key={f.id} className={`cb-field-row${f.enabled ? ' cb-field-row--on' : ''}`}>
                  <input type="checkbox" id={`f_${f.id}`} checked={f.enabled} onChange={() => toggleField(f.id)} />
                  <label htmlFor={`f_${f.id}`} className="cb-field-path">
                    {f.leadPath}
                    {f.note && <span className="cb-badge">{f.note}</span>}
                  </label>
                  <span className="cb-arrow">→</span>
                  <input className="cb-input" style={{ width: 150 }} value={f.apiName}
                    onChange={e => updateApiName(f.id, e.target.value)} disabled={!f.enabled} placeholder="API field name" />
                </div>
              ))}
            </div>
          ))}
        </Card>

        {/* 5 · Static Config Values */}
        <Card title="5 · Static Config Values">
          <p className="cb-hint" style={{ marginBottom: 10 }}>
            Fixed values sent with every lead — company name, source ID, campaign codes, etc.
          </p>
          {staticFields.map(s => (
            <div key={s.id} className="cb-kv-row" style={{ marginBottom: 6 }}>
              <input className="cb-input" style={{ flex: '0 0 160px' }} value={s.key}
                onChange={e => updateStatic(s.id, 'key', e.target.value)} placeholder="Field name (e.g. company)" />
              <input className="cb-input" style={{ flex: 1 }} value={s.value}
                onChange={e => updateStatic(s.id, 'value', e.target.value)} placeholder="Default value (e.g. HomeBuddy)" />
              <button className="cb-remove-btn" onClick={() => removeStatic(s.id)}>✕</button>
            </div>
          ))}
          <button className="cb-add-btn" onClick={addStatic}>+ Add static field</button>
        </Card>

        {/* 6 · Data Providers */}
        <Card title="6 · Data Providers">
          <p className="cb-hint" style={{ marginBottom: 10 }}>Enable extra data sources available in the lead payload.</p>
          {([
            ['form_data',           'Form Data',           'Access d.lead_form_data.* (address from form input)'],
            ['ads',                 'Ads',                 'Access d.ads.* (ad platform metadata)'],
            ['uuid_in_description', 'UUID in Description', 'Append lead UUID to description field'],
          ] as const).map(([k, label, hint]) => (
            <label key={k} className="cb-check-label cb-check-label--block">
              <input type="checkbox" checked={providers[k]} onChange={e => setProviders(p => ({ ...p, [k]: e.target.checked }))} />
              <strong>{label}</strong>
              <span className="cb-hint" style={{ marginLeft: 6 }}>{hint}</span>
            </label>
          ))}
        </Card>

        {/* 7 · Date Transforms */}
        <Card title="7 · Date Transforms (optional)">
          <p className="cb-hint" style={{ marginBottom: 10 }}>
            Convert unix timestamps into formatted strings. A <code>logic_var_set</code> action is generated automatically.
          </p>
          {transforms.map(t => (
            <div key={t.id} className="cb-transform-block">
              <div className="cb-kv-row">
                <select className="cb-select" style={{ flex: '0 0 220px' }} value={t.source}
                  onChange={e => updateTransform(t.id, 'source', e.target.value)}>
                  {DATE_SOURCES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className="cb-arrow">→</span>
                <select className="cb-select" style={{ flex: 1 }} value={t.format}
                  onChange={e => updateTransform(t.id, 'format', e.target.value)}>
                  {DATE_FORMATS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className="cb-remove-btn" onClick={() => removeTransform(t.id)}>✕</button>
              </div>
              {t.format === 'custom' && (
                <input className="cb-input" style={{ marginTop: 4 }} value={t.customFormat}
                  onChange={e => updateTransform(t.id, 'customFormat', e.target.value)}
                  placeholder="e.g. date('d/m/Y', d.lead.created_at_unix_timestamp)" />
              )}
              <div className="cb-kv-row" style={{ marginTop: 6 }}>
                <label className="cb-hint" style={{ minWidth: 100 }}>Variable name:</label>
                <input className="cb-input" style={{ width: 130 }} value={t.varName}
                  onChange={e => updateTransform(t.id, 'varName', e.target.value)} placeholder="date_var" />
                <label className="cb-hint" style={{ minWidth: 68, marginLeft: 8 }}>API field:</label>
                <input className="cb-input" style={{ width: 130 }} value={t.apiName}
                  onChange={e => updateTransform(t.id, 'apiName', e.target.value)} placeholder="inquiryDate" />
              </div>
            </div>
          ))}
          <button className="cb-add-btn" style={{ marginTop: transforms.length ? 6 : 0 }} onClick={addTransform}>
            + Add date transform
          </button>
        </Card>

        {/* 8 · Delivery Checker */}
        <Card title="8 · Delivery Checker">
          <p className="cb-hint" style={{ marginBottom: 10 }}>Define the conditions that determine a successful delivery.</p>

          {steps.length > 1 && (
            <FormRow label="Check step response">
              <select className="cb-select" value={checker.stepActionId}
                onChange={e => setChecker(c => ({ ...c, stepActionId: e.target.value }))}>
                {steps.map(s => <option key={s.id} value={s.actionId}>{s.label} ({s.actionId})</option>)}
              </select>
            </FormRow>
          )}

          <FormRow label="Success status code(s)" hint="comma-separated for multiple">
            <input className="cb-input" value={checker.statusCodes}
              onChange={e => setChecker(c => ({ ...c, statusCodes: e.target.value }))} placeholder="200" />
          </FormRow>

          <FormRow label="Response body">
            <label className="cb-check-label">
              <input type="checkbox" checked={checker.bodyExists}
                onChange={e => setChecker(c => ({ ...c, bodyExists: e.target.checked }))} />
              Body must be non-empty
            </label>
          </FormRow>

          <FormRow label="Body contains" hint="leave blank to skip">
            <input className="cb-input" value={checker.bodyContains}
              onChange={e => setChecker(c => ({ ...c, bodyContains: e.target.value }))}
              placeholder='e.g. success or "accepted"' />
          </FormRow>

          <FormRow label="JSON field check">
            <div>
              <label className="cb-check-label" style={{ marginBottom: 6 }}>
                <input type="checkbox" checked={checker.useDataField}
                  onChange={e => setChecker(c => ({ ...c, useDataField: e.target.checked }))} />
                Verify a field in the JSON response
              </label>
              {checker.useDataField && (
                <div className="cb-kv-row" style={{ marginTop: 4 }}>
                  <input className="cb-input" style={{ width: 140 }} value={checker.dataField}
                    onChange={e => setChecker(c => ({ ...c, dataField: e.target.value }))} placeholder="field (e.g. message)" />
                  <span className="cb-hint" style={{ margin: '0 6px' }}>==</span>
                  <input className="cb-input" style={{ width: 140 }} value={checker.dataValue}
                    onChange={e => setChecker(c => ({ ...c, dataValue: e.target.value }))} placeholder="value (e.g. Success)" />
                </div>
              )}
            </div>
          </FormRow>

          {exprPreview && (
            <div className="cb-expr-preview">
              <span className="cb-hint">Expression: </span>
              <code>{exprPreview}</code>
            </div>
          )}
        </Card>

        <div style={{ height: 20 }} /> {/* bottom padding */}
      </div>

      {/* ── Right: JSON preview ── */}
      <div className="crm-builder__preview">
        <div className="crm-builder__preview-bar">
          <span className="crm-builder__preview-title">Generated Script</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="cb-action-btn" onClick={handleCopy}>{copied ? '✅ Copied!' : '📋 Copy'}</button>
            <button className="cb-action-btn cb-action-btn--primary" onClick={() => onLoadInEditor(json)}>→ Open in Editor</button>
          </div>
        </div>
        <pre className="crm-builder__json">{json}</pre>
      </div>

    </div>
  )
}
