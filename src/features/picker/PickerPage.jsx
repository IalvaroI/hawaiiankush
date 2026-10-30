import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Apple, ArrowLeft, ArrowRight, Banana, Candy, Check, Cherry, Citrus, Coffee, Feather, Flame, Grape, Leaf, Loader2, Moon, RotateCcw, Scale, Smile, Sparkles, Target, UtensilsCrossed, Waves, Zap } from 'lucide-react'
import { useCart } from '../../layout/CartContext.jsx'
import { usePageTitle } from '../../lib/usePageTitle.js'
import { moodOf } from '../../lib/effects.js'
import { categoryIcon } from '../../routes/MenuToolbar.jsx'
import { ProductGrid, ProductGridSkeleton, relationMaps } from '../catalog/ProductGrid.jsx'
import { QUESTION_ORDER, readAnswers } from './pickerModel.js'
import { usePickerQuestions, usePickerResults } from './usePicker.js'
import './picker.css'

// Cosmetic icons by keyword; the option's own name is always the label.
const FLAVOR_ICONS = [[/cherr|berry/i, Cherry], [/citrus|lemon|lime|orange|grapefruit|yuzu/i, Citrus], [/grape/i, Grape], [/banana/i, Banana], [/apple|pear/i, Apple], [/coffee|cocoa|chocolate/i, Coffee], [/candy|sweet|vanilla|haupia|honey/i, Candy]]
const STRENGTH_ICONS = { mild: Feather, balanced: Scale, strong: Flame }
const MOOD_ICONS = { calm: Waves, energy: Zap, happy: Smile, sleep: Moon, euphoric: Sparkles, focus: Target }

function effectIcon(name) {
  if (/hungr|munch|appetite/i.test(name)) return UtensilsCrossed
  return MOOD_ICONS[moodOf(name)] || Sparkles
}

// The answer's own image when the store has one; an icon when it has none or the image fails to load.
function OptionMark({ question, option }) {
  const [failed, setFailed] = useState(false)
  if (option.image && !failed) return <img className="pk-option-image" src={option.image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
  const Icon = question.type === 'category' ? categoryIcon(option.name)
    : question.type === 'strength' ? STRENGTH_ICONS[option.value] || Sparkles
      : question.type === 'flavor' ? FLAVOR_ICONS.find(([pattern]) => pattern.test(option.name))?.[1] || Leaf
        : question.type === 'effect' ? effectIcon(option.name)
          : Sparkles
  return <span className="pk-option-icon"><Icon size={22} strokeWidth={1.6} aria-hidden="true" /></span>
}

// /picker: one question per screen, then the matches. Answers and the current step live in the URL, so Back steps
// through the questions and a results link can be shared.
export function PickerPage() {
  const { categoryList, storeName } = useCart()
  const [params, setParams] = useSearchParams()
  const loaded = usePickerQuestions(categoryList)
  const questions = useMemo(() => (loaded.status === 'ready' ? [...loaded.questions].sort((a, b) => QUESTION_ORDER.indexOf(a.type) - QUESTION_ORDER.indexOf(b.type)) : []), [loaded])
  const answers = useMemo(() => readAnswers(params, questions), [params, questions])
  const stepParam = params.get('step') || ''
  const showResults = stepParam === 'results' && Boolean(answers.category?.length)
  const index = Math.max(0, questions.findIndex((question) => question.type === stepParam))
  const question = questions[index]
  const results = usePickerResults(loaded, answers, showResults)
  usePageTitle(`Find your match · ${storeName}`)

  // Moving to another question is a new history entry, so the browser's Back button steps back through the quiz.
  // Changing an answer only updates the current entry, so going back returns to the question with its answer kept.
  function go(nextAnswers, step, { replace = false } = {}) {
    const next = new URLSearchParams()
    for (const item of questions) if (nextAnswers[item.type]?.length) next.set(item.type, nextAnswers[item.type].join(','))
    next.set('step', step)
    setParams(next, { replace })
  }
  const stepAfter = (position) => questions[position + 1]?.type || 'results'

  function toggle(value) {
    const current = answers[question.type] || []
    let values
    if (current.includes(value)) values = current.filter((item) => item !== value)
    else if (question.max === 1) values = [value]
    else values = [...current, value].slice(-question.max)
    const nextAnswers = { ...answers, [question.type]: values }
    go(nextAnswers, question.type, { replace: true })
    // A single-answer question moves on as soon as it is answered.
    if (question.max === 1 && values.length) go(nextAnswers, stepAfter(index))
  }

  function skip() {
    const { [question.type]: _skipped, ...rest } = answers
    go(rest, stepAfter(index))
  }

  if (loaded.status === 'failed') {
    return (
      <div className="sheet page pk-page">
        <div className="state-panel" role="alert">
          <h1>The product finder didn’t load</h1>
          <p>Check your connection and try again, or browse the menu.</p>
          <Link className="primary-button" to="/">Browse the menu</Link>
        </div>
      </div>
    )
  }
  if (loaded.status !== 'ready' || !question) {
    return <div className="sheet page pk-page"><p className="pk-loading" role="status"><Loader2 className="spin" size={18} aria-hidden="true" /> Getting the questions ready…</p></div>
  }

  if (showResults) return <PickerResults questions={questions} answers={answers} results={results} onRestart={() => setParams(new URLSearchParams())} onEdit={(type) => go(answers, type)} />

  const chosen = answers[question.type] || []
  const canContinue = question.optional || chosen.length > 0
  return (
    <div className="sheet page pk-page">
      <header className="pk-head">
        <p className="eyebrow"><Sparkles size={14} aria-hidden="true" /> Find your match · {index + 1} of {questions.length}</p>
        <ol className="pk-progress" aria-hidden="true">
          {questions.map((item, position) => <li key={item.type} className={position < index ? 'is-done' : position === index ? 'is-current' : ''} />)}
        </ol>
        <h1 className="page-title">{question.title}</h1>
        {question.hint && <p className="pk-hint">{question.hint}</p>}
      </header>

      <div className={`pk-options is-${question.type}`} role="group" aria-label={question.title}>
        {question.options.map((option) => {
          const pressed = chosen.includes(option.value)
          return (
            <button key={option.value} type="button" className="pk-option" aria-pressed={pressed} onClick={() => toggle(option.value)}>
              <OptionMark question={question} option={option} />
              <span className="pk-option-text">
                <span className="pk-option-name">{option.name}</span>
                {option.note && <span className="pk-option-note">{option.note}</span>}
              </span>
              {pressed && <Check className="pk-option-check" size={18} aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      <div className="pk-actions">
        {index > 0
          ? <button type="button" className="text-button pk-back" onClick={() => go(answers, questions[index - 1].type)}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          : <span />}
        <div className="pk-actions-end">
          {/* Once something is chosen, Next is the way on; Skip would throw the choice away. */}
          {question.optional && !chosen.length && <button type="button" className="secondary-button" onClick={skip}>Skip</button>}
          {question.max > 1 && (
            <button type="button" className="primary-button" disabled={!canContinue} onClick={() => go(answers, stepAfter(index))}>
              {stepAfter(index) === 'results' ? 'See my matches' : 'Next'} <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
          {question.max === 1 && chosen.length > 0 && (
            <button type="button" className="primary-button" onClick={() => go(answers, stepAfter(index))}>
              {stepAfter(index) === 'results' ? 'See my matches' : 'Next'} <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PickerResults({ questions, answers, results, onRestart, onEdit }) {
  const summary = questions
    .filter((question) => answers[question.type]?.length)
    .map((question) => ({ type: question.type, names: answers[question.type].map((value) => question.options.find((option) => option.value === value)?.name).filter(Boolean) }))
  const maps = relationMaps(results.relations)
  const products = (results.items || []).map((item) => item.product)
  const matches = Object.fromEntries((results.items || []).map((item) => [item.product.id, { percent: item.percent, reasons: item.reasons }]))

  return (
    <div className="sheet page pk-page pk-results">
      <header className="pk-head">
        <h1 className="page-title">Picked for you</h1>
        <ul className="pk-summary" aria-label="Your answers">
          {summary.map((item) => (
            <li key={item.type}><button type="button" className="chip" onClick={() => onEdit(item.type)} aria-label={`Change ${item.type}: ${item.names.join(', ')}`}>{item.names.join(' · ')}</button></li>
          ))}
          <li><button type="button" className="text-button" onClick={onRestart}><RotateCcw size={14} aria-hidden="true" /> Start over</button></li>
        </ul>
      </header>

      {results.status === 'loading' || results.status === 'idle' ? (
        <ProductGridSkeleton count={6} />
      ) : results.status === 'failed' ? (
        <div className="state-panel" role="alert">
          <h2>We couldn’t load your matches</h2>
          <p>Check your connection and try again.</p>
          <button type="button" className="primary-button" onClick={results.retry}>Try again</button>
        </div>
      ) : products.length ? (
        <>
          {results.full === 0 && <p className="pk-note" role="status">Nothing in stock matches all your answers, so these are the closest picks.</p>}
          {results.full > 0 && results.full < products.length && (
            <p className="pk-note" role="status">{results.full === 1 ? 'The first pick matches' : `The first ${results.full} picks match`} everything you chose; the rest are close.</p>
          )}
          <ProductGrid products={products} brands={maps.brands} strains={maps.strains} matches={matches} />
        </>
      ) : (
        <div className="state-panel">
          <h2>No matches in stock right now</h2>
          <p>Try a different answer, or browse the whole menu.</p>
          <Link className="primary-button" to="/">Browse the menu</Link>
        </div>
      )}
    </div>
  )
}
