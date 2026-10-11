package com.openmic.tv

import android.view.KeyEvent

/** Fire TV remote (and game controller) keys → names understood by the TV web page. */
object RemoteKeys {
    private val NAMES = mapOf(
        KeyEvent.KEYCODE_DPAD_UP to "up",
        KeyEvent.KEYCODE_DPAD_DOWN to "down",
        KeyEvent.KEYCODE_DPAD_LEFT to "left",
        KeyEvent.KEYCODE_DPAD_RIGHT to "right",
        KeyEvent.KEYCODE_DPAD_CENTER to "select",
        KeyEvent.KEYCODE_ENTER to "select",
        KeyEvent.KEYCODE_NUMPAD_ENTER to "select",
        KeyEvent.KEYCODE_BUTTON_A to "select",
        KeyEvent.KEYCODE_BACK to "back",
        KeyEvent.KEYCODE_ESCAPE to "back",
        KeyEvent.KEYCODE_BUTTON_B to "back",
        KeyEvent.KEYCODE_MENU to "menu",
        KeyEvent.KEYCODE_BUTTON_START to "menu",
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE to "playpause",
        KeyEvent.KEYCODE_MEDIA_PLAY to "playpause",
        KeyEvent.KEYCODE_MEDIA_PAUSE to "playpause",
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD to "forward",
        KeyEvent.KEYCODE_MEDIA_NEXT to "forward",
        KeyEvent.KEYCODE_MEDIA_REWIND to "rewind",
        KeyEvent.KEYCODE_MEDIA_PREVIOUS to "rewind",
    )

    private val REPEATABLE = setOf("up", "down", "left", "right")

    fun name(keyCode: Int): String? = NAMES[keyCode]

    fun repeats(name: String): Boolean = name in REPEATABLE
}
