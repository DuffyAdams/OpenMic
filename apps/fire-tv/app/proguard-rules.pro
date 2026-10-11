# Methods called from the web page through the WebView JavaScript bridge.
-keepclassmembers class com.openmic.tv.KaraokeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
