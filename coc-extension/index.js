const { diagnosticManager, events, window, workspace, Disposable } = require('coc.nvim')

// Suggested usage:
//   1. Set the coc configuration setting `lsp_lines.currentLineOnly` to
//      `true` or `false`, depending on whether you want to display only the
//      diagnostics on the current line.
//   2. Use kepmappings like the one below to enable easy toggling of this extension:
//       nnoremap <Leader>ll :call CocAction("toggleExtension", "lsp_lines")<CR>

const outputChannel = window.createOutputChannel("lsp_lines")
outputChannel.appendLine("[*] Initialized output channel for lsp_lines")

exports.activate = async context => {
  const currentLineOnly = workspace.getConfiguration().get("lsp_lines").currentLineOnly
  if (currentLineOnly) {
    await activateCurrentLineOnlyMode(context)
  } else {
    await activateAllLinesMode(context)
  }
}

/**
 * Activates the lsp_lines extension in current-line-only mode, where the
 * extension will only display diagnostics on the line where the cursor is.
 */
async function activateCurrentLineOnlyMode(context) {
  const {nvim} = workspace
  const NS = await nvim.createNamespace('coc-lsp-lines')
  const {subscriptions} = context
  const diagnosticRefreshEvent = diagnosticManager.onDidRefresh(async (e) => {
    outputChannel.appendLine(`[*] onDidRefresh. e: ${JSON.stringify(e)}`)
    const window = await nvim.window
    const cursor = await window.cursor
    const [lnum, _col] = cursor
    nvim.call('luaeval', [
      "require'lsp_lines.render'.show(_A[1], _A[2], _A[3], _A[4], _A[5])",
      [
        NS,
        e.bufnr,
        e.diagnostics.map(d => populateLnumAndCol(d)).filter(d => diagnosticIsOnLine(d, lnum)),
        {},
        'coc',
      ],
    ])
  })

  const cursorMovedEvent = events.on("CursorMoved", async (bufnr, cursor) => {
    const [lnum, _col] = cursor
    const [cocBuffer, _position] = await diagnosticManager.getBufferAndPosition()
    const diagnosticsBySource = await diagnosticManager.getDiagnostics(cocBuffer)
    var flattenedDiagnostics = []
    for (const source in diagnosticsBySource) {
      flattenedDiagnostics.push(...diagnosticsBySource[source])
    }
    outputChannel.appendLine(`[*] CursorMoved.. flattenedDiagnostics: ${JSON.stringify(flattenedDiagnostics)}`)
    nvim.call('luaeval', [
      "require'lsp_lines.render'.show(_A[1], _A[2], _A[3], _A[4], _A[5])",
      [
        NS,
        bufnr,
        flattenedDiagnostics.map(d => populateLnumAndCol(d)).filter(d => diagnosticIsOnLine(d, lnum)),
        {},
        'coc',
      ],
    ])
  })

  // `subscriptions` is an array of Disposable that will be disposed of by
  // coc.nvim. Both `diagnosticRefreshEvent` and `cursorMovedEvent` implement
  // Disposable. The final disposable created with `Disposable.create()` is to
  // simply clear the namespace created by this lsp_lines.nvim extension.
  subscriptions.push(
    diagnosticRefreshEvent,
    cursorMovedEvent,
    Disposable.create(() => {
      nvim.lua(`
        for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
          vim.api.nvim_buf_clear_namespace(bufnr, ${NS}, 0, -1)
        end
        `)
    })
  )
}

/**
 * Activates the lsp_lines extension in all-line-only mode (the default), where
 * the extension will display all diagnostics (including on the line where the
 * cursor is not on).
 */
async function activateAllLinesMode(context) {
  const {nvim} = workspace
  const NS = await nvim.createNamespace('coc-lsp-lines')
  const {subscriptions} = context
  const diagnosticRefreshEvent = diagnosticManager.onDidRefresh(async (e) => {
    outputChannel.appendLine(`[*] onDidRefresh. e: ${JSON.stringify(e)}`)
    nvim.call('luaeval', [
      "require'lsp_lines.render'.show(_A[1], _A[2], _A[3], _A[4], _A[5])",
      [
        NS,
        e.bufnr,
        e.diagnostics.map(d => populateLnumAndCol(d)),
        {},
        'coc',
      ],
    ])
  })

  // `subscriptions` is an array of Disposable that will be disposed of by
  // coc.nvim, and `diagnosticRefreshEvent` implements Disposable. The final
  // disposable created with `Disposable.create()` is to simply clear the
  // namespace created by this lsp_lines.nvim extension.
  subscriptions.push(
    diagnosticRefreshEvent,
    Disposable.create(() => {
      nvim.lua(`
        for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
          vim.api.nvim_buf_clear_namespace(bufnr, ${NS}, 0, -1)
        end
        `)
    })
  )
}

/**
 * Returns true if the coc Diagnostic object is on line `lnum`.
 */
function diagnosticIsOnLine(cocDiagnostic, lnum) {
    let { start, end } = cocDiagnostic.range
    return start.line <= lnum - 1 && end.line >= lnum -1
}

/**
 * Populates the `lnum` and `col` properties on the coc Diagnostic object, so
 * that the resultig diagnostic object can be handled within lsp_lines.
 */
function populateLnumAndCol(cocDiagnostic) {
  const { start } = cocDiagnostic.range
  cocDiagnostic.lnum = start.line
  cocDiagnostic.col = start.character
  return cocDiagnostic
}

