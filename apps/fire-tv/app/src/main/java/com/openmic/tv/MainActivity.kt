package com.openmic.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView

/**
 * Thin native shell around the TV web page served by the party server.
 *
 * Why a WebView page instead of a fully native UI: the official YouTube IFrame player must run
 * from a real web origin (it needs a valid Referer), and serving the TV UI from the server lets
 * it update without reinstalling the APK. The shell provides what a browser can't:
 *  - autoplay without a tap (needed to auto-advance through the queue),
 *  - every remote key routed to the page (D-pad, Back, Menu, media keys),
 *  - screen kept awake, Back never quits mid-song, and an offline/retry screen.
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var overlay: View
    private lateinit var overlayTitle: TextView
    private lateinit var overlayMessage: TextView
    private lateinit var retryButton: Button
    private lateinit var settingsButton: Button

    private val handler = Handler(Looper.getMainLooper())
    private var baseUrl: String = ""
    private var pageReady = false
    private var mainFrameFailed = false
    private var retrySeconds = 0

    private val retryTick = object : Runnable {
        override fun run() {
            if (retrySeconds <= 0) {
                reloadPage()
                return
            }
            overlayMessage.text = getString(R.string.retrying_in, lastError, retrySeconds)
            retrySeconds--
            handler.postDelayed(this, 1000)
        }
    }
    private var lastError = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // `adb shell am start -n com.openmic.tv/.MainActivity --es server_url https://...`
        intent?.getStringExtra(EXTRA_SERVER_URL)?.let { ServerConfig.normalize(it) }?.let {
            ServerConfig.save(this, it)
        }
        val url = ServerConfig.serverUrl(this)
        if (url == null) {
            openSettings()
            finish()
            return
        }
        baseUrl = url

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.web_view)
        overlay = findViewById(R.id.overlay)
        overlayTitle = findViewById(R.id.overlay_title)
        overlayMessage = findViewById(R.id.overlay_message)
        retryButton = findViewById(R.id.retry_button)
        settingsButton = findViewById(R.id.settings_button)
        retryButton.setOnClickListener { reloadPage() }
        settingsButton.setOnClickListener { openSettings() }

        configureWebView()
        showLoading()
        webView.loadUrl(ServerConfig.tvPageUrl(baseUrl))
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        val newUrl = intent?.getStringExtra(EXTRA_SERVER_URL)?.let { ServerConfig.normalize(it) }
        if (newUrl != null && newUrl != baseUrl) {
            ServerConfig.save(this, newUrl)
            // recreate() re-runs onCreate with getIntent(); without this, the launch intent's
            // older server_url extra would be saved back over the new one.
            setIntent(intent)
            recreate()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.setBackgroundColor(Color.rgb(11, 13, 18))
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false // lets songs start (and auto-advance) by themselves
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            setSupportZoom(false)
            builtInZoomControls = false
            userAgentString = "$userAgentString OpenMicTV/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.addJavascriptInterface(KaraokeBridge(this), "OpenMicNative")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                // Stay on the party server; never leave the app (e.g. YouTube logo clicks).
                return Uri.parse(request.url.toString()).host != Uri.parse(baseUrl).host
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                pageReady = false
                mainFrameFailed = false
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (!mainFrameFailed) {
                    pageReady = true
                    hideOverlay()
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    mainFrameFailed = true
                    showError(error.description?.toString() ?: getString(R.string.error_generic))
                }
            }

            override fun onReceivedHttpError(
                view: WebView, request: WebResourceRequest, response: WebResourceResponse,
            ) {
                if (request.isForMainFrame && response.statusCode >= 400) {
                    mainFrameFailed = true
                    showError(getString(R.string.error_http, response.statusCode))
                }
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Log.w(TAG, "WebView renderer stopped; restarting the page")
                recreate()
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) = request.deny()

            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) Log.d(TAG, "page: ${message.message()}")
                return true
            }

            // Avoid WebView's grey "play" poster flashing before videos start.
            override fun getDefaultVideoPoster(): Bitmap =
                Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        }
    }

    /** Every remote key goes to the page, which decides what it means on the current screen. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val name = RemoteKeys.name(event.keyCode) ?: return super.dispatchKeyEvent(event)
        if (!::webView.isInitialized) return super.dispatchKeyEvent(event)
        if (overlay.visibility == View.VISIBLE || !pageReady) {
            // Native error/loading screen: let its buttons take focus; Menu opens settings.
            if (event.keyCode == KeyEvent.KEYCODE_MENU && event.action == KeyEvent.ACTION_UP) {
                openSettings()
                return true
            }
            return super.dispatchKeyEvent(event)
        }
        if (event.action != KeyEvent.ACTION_DOWN) return true
        if (event.repeatCount > 0 && !RemoteKeys.repeats(name)) return true
        webView.evaluateJavascript("window.__tvKey ? window.__tvKey('$name') : false") { result ->
            if (result != "true" && name == "back") onUnhandledBack()
        }
        return true
    }

    private fun onUnhandledBack() {
        if (webView.canGoBack()) webView.goBack() else finish()
    }

    fun openSettings() {
        startActivity(Intent(this, SetupActivity::class.java))
    }

    fun reloadPage() {
        handler.removeCallbacks(retryTick)
        showLoading()
        webView.loadUrl(ServerConfig.tvPageUrl(baseUrl))
    }

    private fun showLoading() {
        overlay.visibility = View.VISIBLE
        overlayTitle.text = getString(R.string.connecting)
        overlayMessage.text = baseUrl
        retryButton.visibility = View.GONE
        settingsButton.visibility = View.GONE
    }

    private fun showError(message: String) {
        lastError = message
        overlay.visibility = View.VISIBLE
        overlayTitle.text = getString(R.string.error_title)
        retryButton.visibility = View.VISIBLE
        settingsButton.visibility = View.VISIBLE
        retryButton.requestFocus()
        handler.removeCallbacks(retryTick)
        retrySeconds = RETRY_SECONDS
        handler.post(retryTick)
    }

    private fun hideOverlay() {
        handler.removeCallbacks(retryTick)
        overlay.visibility = View.GONE
        webView.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
        hideSystemUi()
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("OpenMicNative")
            webView.destroy()
        }
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.hide(android.view.WindowInsets.Type.systemBars())
        } else {
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }

    companion object {
        const val EXTRA_SERVER_URL = "server_url"
        private const val TAG = "OpenMic"
        private const val RETRY_SECONDS = 8
    }
}
