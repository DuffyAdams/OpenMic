import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val defaultServerUrl = (findProperty("karaokeServerUrl") as String?)?.trim().orEmpty()

// Release signing: put storeFile/storePassword/keyAlias/keyPassword in keystore.properties.
// Without it, release builds are signed with the debug key (fine for sideloading).
val keystoreProps = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "com.openmic.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.openmic.tv"
        minSdk = 25 // Fire OS 6+; the Fire TV Cube (3rd gen) runs Fire OS 7 (API 28)
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"$defaultServerUrl\"")
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        // TV banners ship at xhdpi only (Android TV guideline); dependency/target bumps are deliberate.
        disable += setOf("SetJavaScriptEnabled", "OldTargetApi", "GradleDependency", "IconMissingDensityFolder")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

base {
    archivesName.set("openmic-tv-${android.defaultConfig.versionName}")
}
