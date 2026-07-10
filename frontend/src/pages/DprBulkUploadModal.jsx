import { useState, useRef } from 'react'
import { X, Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { parseDprFile, downloadErrorReport } from '../lib/dprBulkTemplate'
import { bulkCreateEntries } from '../lib/api'

export default function DprBulkUploadModal({ machine, onClose, onSuccess }) {
  const fileRef  = useRef()
  const [step,      setStep]      = useState('idle')      // idle | parsing | review | uploading | done
  const [parseErr,  setParseErr]  = useState(null)
  const [valid,     setValid]     = useState([])
  const [errors,    setErrors]    = useState([])
  const [total,     setTotal]     = useState(0)
  const [uploaded,  setUploaded]  = useState(null)   // { inserted, failed }
  const [showErrors, setShowErrors] = useState(true)
  const [showPreview, setShowPreview] = useState(false)

  const isDual = machine.shift_type === 'Dual Shift'
  const unit   = machine.reading1_basis || 'Hrs'
  const name   = machine.nickname || machine.slno

  const handleFile = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.match(/\.xlsx?$/i)) { setParseErr('File must be an Excel file (.xlsx)'); return }
    setStep('parsing'); setParseErr(null)
    try {
      const result = await parseDprFile(file, machine)
      if (result.error) { setParseErr(result.error); setStep('idle'); return }
      setValid(result.valid || [])
      setErrors(result.errors || [])
      setTotal(result.total || 0)
      setStep('review')
    } catch (ex) {
      setParseErr('Failed to read file: ' + ex.message)
      setStep('idle')
    }
    e.target.value = ''
  }

  const handleUpload = async () => {
    if (valid.length === 0) return
    setStep('uploading')
    try {
      const res = await bulkCreateEntries({ machine_id: machine.id, entries: valid })
      setUploaded(res.data)
      setStep('done')
      if (res.data.inserted > 0) onSuccess()
    } catch (ex) {
      setParseErr(ex.response?.data?.error || 'Upload failed. Please try again.')
      setStep('review')
    }
  }

  const reset = () => {
    setStep('idle'); setParseErr(null); setValid([]); setErrors([]); setTotal(0); setUploaded(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-blue-600" />
            <span className="font-semibold text-gray-900">Bulk Upload DPR</span>
            <span className="text-xs text-gray-400 ml-1">— {name}</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* ── IDLE / PARSING ── */}
          {(step === 'idle' || step === 'parsing') && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 space-y-1">
                <p className="font-semibold">How to upload:</p>
                <ol className="list-decimal pl-5 space-y-0.5 text-xs text-blue-700">
                  <li>Download the template from the DPR page (Download Template button)</li>
                  <li>Fill in Opening Reading, Closing Reading, Diesel Filled and Remarks</li>
                  <li>Save the file and upload it here</li>
                </ol>
              </div>
              {parseErr && (
                <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{parseErr}</span>
                </div>
              )}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                {step === 'parsing' ? (
                  <div className="flex flex-col items-center gap-2 text-blue-600">
                    <Loader2 size={28} className="animate-spin" />
                    <p className="text-sm font-medium">Parsing file…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <FileSpreadsheet size={28} className="text-blue-400" />
                    <p className="text-sm font-medium text-gray-700">Click to select Excel file (.xlsx)</p>
                    <p className="text-xs text-gray-400">or drag-and-drop</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </div>
          )}

          {/* ── REVIEW ── */}
          {step === 'review' && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 border border-gray-200 rounded-xl py-3">
                  <p className="text-xl font-bold text-gray-800">{total}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total Records</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl py-3">
                  <p className="text-xl font-bold text-green-700">{valid.length}</p>
                  <p className="text-xs text-green-600 mt-0.5">Valid / Ready</p>
                </div>
                <div className={`border rounded-xl py-3 ${errors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-xl font-bold ${errors.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{errors.length}</p>
                  <p className={`text-xs mt-0.5 ${errors.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>Errors</p>
                </div>
              </div>

              {parseErr && (
                <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{parseErr}</span>
                </div>
              )}

              {/* Errors table */}
              {errors.length > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowErrors(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors">
                    <span className="flex items-center gap-2"><AlertTriangle size={13} /> {errors.length} row{errors.length > 1 ? 's' : ''} with errors</span>
                    {showErrors ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {showErrors && (
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-red-50 border-b border-red-100">
                            <th className="px-3 py-2 text-left font-medium text-red-700 w-12">Row</th>
                            <th className="px-3 py-2 text-left font-medium text-red-700 w-28">Date</th>
                            <th className="px-3 py-2 text-left font-medium text-red-700">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {errors.map((e, i) => (
                            <tr key={i} className="border-b border-red-50 hover:bg-red-50/50">
                              <td className="px-3 py-1.5 text-gray-500 font-mono">{e.row}</td>
                              <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{e.date}</td>
                              <td className="px-3 py-1.5 text-red-600">{e.errors.join(' | ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Valid records preview */}
              {valid.length > 0 && (
                <div className="border border-green-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowPreview(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-green-50 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors">
                    <span className="flex items-center gap-2"><CheckCircle size={13} /> {valid.length} valid records ready to upload</span>
                    {showPreview ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {showPreview && (
                    <div className="overflow-x-auto max-h-52">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-green-50 border-b border-green-100">
                            <th className="px-2 py-2 text-left font-medium text-green-700">Date</th>
                            <th className="px-2 py-2 text-right font-medium text-green-700">Open ({unit})</th>
                            <th className="px-2 py-2 text-right font-medium text-green-700">Close ({unit})</th>
                            <th className="px-2 py-2 text-right font-medium text-green-700">Hrs</th>
                            {isDual && <th className="px-2 py-2 text-right font-medium text-green-700">Night Close</th>}
                            <th className="px-2 py-2 text-right font-medium text-green-700">Diesel (L)</th>
                            <th className="px-2 py-2 text-right font-medium text-green-700">Bkdn (Hrs)</th>
                            <th className="px-2 py-2 text-left font-medium text-green-700">Work Done</th>
                            <th className="px-2 py-2 text-right font-medium text-green-700">Qty</th>
                            <th className="px-2 py-2 text-left font-medium text-green-700">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {valid.map((v, i) => {
                            const hrs = v.r1_close != null && v.r1_open != null ? (parseFloat(v.r1_close) - parseFloat(v.r1_open)).toFixed(2) : '—'
                            return (
                              <tr key={i} className="border-b border-green-50 hover:bg-green-50/40">
                                <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono text-[11px]">{v.date}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{v.r1_open ?? '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{v.r1_close ?? '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-blue-700 font-medium">{hrs}</td>
                                {isDual && <td className="px-2 py-1.5 text-right tabular-nums">{v.n_r1_close ?? '—'}</td>}
                                <td className="px-2 py-1.5 text-right tabular-nums">{v.hsd ?? '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-red-700">{v.breakdown != null ? v.breakdown : '—'}</td>
                                <td className="px-2 py-1.5 text-gray-600 truncate max-w-[100px]">{v.work_done || '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{v.qty ?? '—'}</td>
                                <td className="px-2 py-1.5 text-gray-500 truncate max-w-[80px]">{v.remarks || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {errors.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ Fix all errors and re-upload the file, or proceed to upload only the {valid.length} valid record{valid.length !== 1 ? 's' : ''}.
                </p>
              )}
            </div>
          )}

          {/* ── UPLOADING ── */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center gap-3 py-10 text-blue-600">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm font-medium">Uploading {valid.length} records…</p>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && uploaded && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle size={36} className="text-green-500" />
                <p className="font-semibold text-gray-800">Upload Complete</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 border border-gray-200 rounded-xl py-3">
                  <p className="text-xl font-bold text-gray-800">{uploaded.total ?? valid.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total Sent</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl py-3">
                  <p className="text-xl font-bold text-green-700">{uploaded.inserted}</p>
                  <p className="text-xs text-green-600 mt-0.5">Inserted</p>
                </div>
                <div className={`border rounded-xl py-3 ${uploaded.failed?.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-xl font-bold ${uploaded.failed?.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{uploaded.failed?.length ?? 0}</p>
                  <p className={`text-xs mt-0.5 ${uploaded.failed?.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>Skipped</p>
                </div>
              </div>
              {uploaded.failed?.length > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden">
                  <p className="px-4 py-2 bg-red-50 text-xs font-medium text-red-700">Skipped rows (already exist or DB error)</p>
                  <div className="max-h-36 overflow-y-auto">
                    {uploaded.failed.map((f, i) => (
                      <div key={i} className="flex gap-3 px-4 py-1.5 border-b border-red-50 text-xs">
                        <span className="font-mono text-gray-500 w-24 flex-shrink-0">{f.date}</span>
                        <span className="text-red-600">{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex gap-2">
            {step === 'review' && errors.length > 0 && (
              <button
                onClick={() => downloadErrorReport(errors, name)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
                <Download size={12} /> Error Report
              </button>
            )}
            {(step === 'review' || step === 'done') && (
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                {step === 'done' ? 'Upload Another' : 'Re-upload'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              {step === 'done' ? 'Close' : 'Cancel'}
            </button>
            {step === 'review' && valid.length > 0 && (
              <button
                onClick={handleUpload}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2">
                <Upload size={13} /> Upload {valid.length} Record{valid.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
