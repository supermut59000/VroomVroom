package fr.ouiouibaguette.vroomvroom;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Barre de statut = fond de l'app, dans TOUS les modes.
 *
 * Android 15/16 impose l'edge-to-edge. Capacitor 8 choisit dynamiquement entre
 * deux stratégies selon la version du WebView :
 *   - WebView récent : "css"  -> le web peint la bande (fond de l'app)
 *   - WebView ancien : "native" -> le décor est paddé (bande = windowBackground,
 *     qui suit le thème SYSTÈME, pas le thème de l'app -> bande blanche/grise
 *     au-dessus d'une app sombre).
 * D'où des rendus différents entre appareils.
 *
 * Ici on force la stratégie "le web peint" : on installe (après Capacitor) un
 * listener d'insets qui NE padde PAS le haut, et on transmet la hauteur de la
 * barre de statut au CSS via la variable --sat. Le header de l'app se décale
 * sous l'horloge (voir App.tsx / Header.tsx) et la bande affiche le fond web,
 * donc le thème de l'app (gris clair en light, noir en dark).
 *
 * Le bas (barre de gestes / clavier) reste paddé pour ne rien masquer.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            // Pas de padding en haut : le WebView passe sous la barre de statut
            // et peint la bande avec le fond de l'app.
            v.setPadding(0, 0, 0, keyboardVisible ? ime.bottom : bars.bottom);

            injectInset("--sat", bars.top);
            return insets;
        });
    }

    private void injectInset(final String cssVar, final int px) {
        final View web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        // Les px injectés par Android sont PHYSIQUES ; le CSS raisonne en dp
        // (CSS px). Sans la conversion, la barre de statut paraît 2,6x trop
        // haute sur un écran 420 dpi.
        final float dp = px / getResources().getDisplayMetrics().density;
        web.post(() -> web.postDelayed(() -> {
            String js = "document.documentElement.style.setProperty('" + cssVar + "','"
                    + dp + "px')";
            getBridge().getWebView().evaluateJavascript(js, null);
        }, 60));
    }
}
