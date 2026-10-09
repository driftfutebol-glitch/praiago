# Add project specific ProGuard rules here.
## Preserve the locally registered notification plugin and resource bridge.
-keep class com.ferrazcode.praiago.notifications.** { *; }
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Capacitor reads plugin/permission annotations and callbacks through reflection.
# In the optimized v12 release R8 removed PluginHandle.pluginAnnotation and
# replaced permission-state evaluation with an unconditional null throw.
# Preserve this small runtime boundary, not the entire application/dependencies.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keep @interface com.getcapacitor.annotation.** { *; }
-keep @interface com.getcapacitor.PluginMethod { *; }
-keep @interface com.getcapacitor.NativePlugin { *; }
-keep class com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.PluginHandle { *; }
