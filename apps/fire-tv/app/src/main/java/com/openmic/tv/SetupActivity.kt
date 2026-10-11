package com.openmic.tv

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView

/** First-run (and "Change server") screen: where is the party server? */
class SetupActivity : Activity() {
    private lateinit var input: EditText
    private lateinit var error: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        input = findViewById(R.id.server_input)
        error = findViewById(R.id.error_text)
        val save: Button = findViewById(R.id.save_button)

        input.setText(ServerConfig.serverUrl(this) ?: "https://")
        input.setSelection(input.text.length)
        input.setOnEditorActionListener { _, actionId, event ->
            val enter = event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN
            if (actionId == EditorInfo.IME_ACTION_DONE || actionId == EditorInfo.IME_ACTION_GO || enter) {
                save()
                true
            } else {
                false
            }
        }
        save.setOnClickListener { save() }
    }

    private fun save() {
        val url = ServerConfig.normalize(input.text.toString())
        if (url == null) {
            error.text = getString(R.string.setup_invalid)
            return
        }
        ServerConfig.save(this, url)
        startActivity(
            Intent(this, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_SERVER_URL, url)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        finish()
    }
}
