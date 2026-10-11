package com.openmic.tv

import android.webkit.JavascriptInterface

/**
 * Exposed to the TV page as `window.OpenMicNative`. Calls arrive on a WebView binder thread,
 * so everything that touches the UI hops to the main thread. Only harmless app-level actions are
 * exposed (no file, network or device access).
 */
class KaraokeBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun exitApp() = activity.runOnUiThread { activity.finishAndRemoveTask() }

    @JavascriptInterface
    fun appVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun openSettings() = activity.runOnUiThread { activity.openSettings() }

    @JavascriptInterface
    fun reload() = activity.runOnUiThread { activity.reloadPage() }
}
