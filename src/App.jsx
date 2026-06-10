import { useState, useRef, useCallback } from 'react'

const API_URL = '/api/messages'

const PROMPT = `Eres un corrector estricto y preciso de textos escritos a mano, especializado en errores ortográficos y disléxicos.

REGLAS CRÍTICAS — léelas antes de analizar:
1. Solo marca una palabra con "has_error": true si su CORRECCIÓN ES DISTINTA a la palabra original. Nunca marques una palabra correcta como errónea.
2. Si una misma palabra aparece varias veces en el texto y en algunas instancias está bien escrita, esas instancias van con "has_error": false.
3. Palabras correctas como "lo", "que", "y", "de", "en", "el", "la", "no", "te", "me", "se" NO son errores NUNCA a menos que estén claramente mal escritas (ej: "qe" en lugar de "que").
4. NO inventes errores. Es preferible NO corregir algo dudoso que corregir algo correcto.
5. El texto corregido debe ser una versión fluida y completa del texto original con solo los errores reales corregidos. Si no puedes leer una palabra, transcríbela como la ves — nunca escribas "[ilegible]".

Errores válidos a detectar:
- Ortográficos reales: tildes faltantes en palabras que las necesitan, confusión b/v, h muda, mayúsculas donde corresponde
- Disléxicos reales: inversión de letras (b↔d, p↔q, n↔u), transposición de letras (al→la), omisión de letras que cambian la palabra, adición de letras extra

Responde ÚNICAMENTE con JSON válido (sin texto adicional, sin bloques de código):
{
  "transcription": "texto transcrito exactamente como está escrito, sin cambios",
  "has_errors": true,
  "words": [
    {"text": "palabra", "has_error": false},
    {"text": "pieso", "has_error": true, "correction": "pienso", "error_type": "omisión de letra 'n'"}
  ],
  "corrected_text": "el texto completo corregido, fluido y sin errores",
  "error_count": 1,
  "summary": "Se encontró 1 error."
}

Si no hay texto visible: {"transcription":"","has_errors":false,"words":[],"corrected_text":"","error_count":0,"summary":"No se detectó texto escrito en la imagen."}`

function IconCamera() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="w-14 h-14 text-gray-200">
      <rect x="4" y="13" width="40" height="29" rx="5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="27.5" r="7.5" stroke="currentColor" strokeWidth="2.5" />
      <path d="M17 13l3-5h8l3 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="38" cy="19" r="2" fill="currentColor" />
    </svg>
  )
}

function IconArrow() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-gray-300 flex-shrink-0">
      <path fillRule="evenodd" d="M2 8a.5.5 0 01.5-.5h9.293L9.146 4.854a.5.5 0 11.708-.708l4 4a.5.5 0 010 .708l-4 4a.5.5 0 11-.708-.708L11.793 8.5H2.5A.5.5 0 012 8z" clipRule="evenodd" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
    </svg>
  )
}

export default function App() {
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef(null)
  const cameraRef = useRef(null)

  const loadFile = useCallback((file) => {
    if (!file?.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => setImage({ url: e.target.result, type: file.type })
    reader.readAsDataURL(file)
    setResult(null)
    setApiError(null)
  }, [])

  const analyze = async () => {
    setLoading(true)
    setApiError(null)
    setResult(null)
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: image.type, data: image.url.split(',')[1] },
              },
              { type: 'text', text: PROMPT },
            ],
          }],
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error?.message || `Error ${res.status}`)
      }

      const data = await res.json()
      const raw = data.content[0].text
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No se pudo leer la respuesta de la API')
      setResult(JSON.parse(match[0]))
    } catch (e) {
      setApiError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(result.corrected_text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reset = () => {
    setImage(null)
    setResult(null)
    setApiError(null)
  }

  // Filtra falsos positivos (corrección igual al original) y deduplica
  const errorWords = (() => {
    if (!result?.words) return []
    const seen = new Set()
    return result.words.filter(w => {
      if (!w.has_error) return false
      if (!w.correction || w.correction.toLowerCase() === w.text.toLowerCase()) return false
      const key = `${w.text.toLowerCase()}→${w.correction.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  return (
    <div className="min-h-screen bg-white font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 h-[64px] flex items-center justify-center gap-3">
        <img src="/dislexza.png" alt="Dislexza" className="h-9 w-9 rounded-xl" />
        <span className="text-[1.35rem] font-bold tracking-tight text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          dislexza
        </span>
      </header>

      <main className="max-w-[560px] mx-auto px-5 py-10 pb-24">

        {/* Hero */}
        {!result && (
          <div className="text-center mb-8">
            <h1 className="text-[1.65rem] sm:text-[1.9rem] font-bold leading-tight text-gray-900 mb-2.5">
              Detectá errores en texto<br />escrito a mano
            </h1>
            <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
              Sacá una foto o subí una imagen de tu escrito. Encontramos errores ortográficos y disléxicos al instante.
            </p>
          </div>
        )}

        {/* Drop zone */}
        <div
          className={`relative rounded-[1.6rem] border-2 border-dashed transition-all duration-200 ${
            dragging
              ? 'border-gray-800 bg-gray-50 scale-[1.015]'
              : image
              ? 'border-gray-100'
              : 'border-gray-200 hover:border-gray-300 cursor-pointer'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]) }}
          onClick={() => !image && fileRef.current?.click()}
        >
          {image ? (
            <div className="p-3">
              <img
                src={image.url}
                alt="Vista previa"
                className="w-full rounded-[1.2rem] max-h-72 object-contain bg-gray-50"
              />
              <button
                onClick={(e) => { e.stopPropagation(); reset() }}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/90 border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:border-gray-400 transition-all shadow-sm text-xs font-medium"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-14 px-6 text-center gap-1.5">
              <IconCamera />
              <p className="mt-3 text-gray-600 font-medium text-sm">Arrastrá una imagen o tocá para subir</p>
              <p className="text-gray-400 text-xs">PNG, JPG, HEIC</p>
              <button
                onClick={(e) => { e.stopPropagation(); cameraRef.current?.click() }}
                className="mt-4 text-xs px-5 py-2.5 rounded-full border border-gray-200 text-gray-500 hover:border-gray-800 hover:text-gray-800 transition-all font-medium"
              >
                Usar cámara
              </button>
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => loadFile(e.target.files[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => loadFile(e.target.files[0])} />

        {/* Analyze button */}
        {image && (
          <button
            onClick={analyze}
            disabled={loading}
            className="w-full mt-3 py-4 rounded-[1.1rem] bg-gray-900 text-white font-semibold text-[0.95rem] tracking-wide hover:bg-black active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white spinner" />
                Analizando...
              </>
            ) : (
              'Analizar texto'
            )}
          </button>
        )}

        {/* Error */}
        {apiError && (
          <div className="mt-4 p-4 rounded-2xl bg-red-50 border border-red-100">
            <p className="text-red-500 text-sm leading-relaxed">{apiError}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-3.5 fade-up">

            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold ${
                result.has_errors ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'
              }`}>
                {result.has_errors
                  ? `${result.error_count} error${result.error_count !== 1 ? 'es' : ''} encontrado${result.error_count !== 1 ? 's' : ''}`
                  : <><IconCheck /> Sin errores</>
                }
              </span>
              <button onClick={reset} className="ml-auto text-xs text-gray-400 hover:text-gray-700 transition-colors font-medium">
                Nueva imagen
              </button>
            </div>

            <Card label="Texto detectado">
              <p className="p-5 leading-relaxed text-[1rem] text-gray-800 break-words">
                {result.words.map((w, i) => {
                  const isRealError = w.has_error && w.correction && w.correction.toLowerCase() !== w.text.toLowerCase()
                  return isRealError ? (
                    <span key={i} className="text-red-500 underline underline-offset-2 decoration-wavy decoration-red-400/60">
                      {w.text}{' '}
                    </span>
                  ) : (
                    <span key={i}>{w.text}{' '}</span>
                  )
                })}
              </p>
            </Card>

            {errorWords.length > 0 && (
              <Card label="Correcciones">
                {errorWords.map((w, i) => (
                  <div key={i} className={`px-5 py-3.5 flex flex-col gap-1.5 ${i < errorWords.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-red-400 line-through text-sm">{w.text}</span>
                      <IconArrow />
                      <span className="font-semibold text-gray-900 text-sm">{w.correction}</span>
                    </div>
                    {w.error_type && (
                      <span className="text-[0.68rem] text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full self-start leading-snug">
                        {w.error_type}
                      </span>
                    )}
                  </div>
                ))}
              </Card>
            )}

            {result.has_errors && (
              <Card label="Texto corregido" action={
                <button onClick={copy} className="text-xs text-gray-400 hover:text-gray-700 transition-colors font-medium">
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              }>
                <p className="p-5 leading-relaxed text-[1rem] text-gray-700 break-words">
                  {result.corrected_text}
                </p>
              </Card>
            )}

          </div>
        )}
      </main>
    </div>
  )
}

function Card({ label, action, children }) {
  return (
    <div className="rounded-[1.4rem] border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-[0.1em]">{label}</span>
        {action}
      </div>
      {children}
    </div>
  )
}
