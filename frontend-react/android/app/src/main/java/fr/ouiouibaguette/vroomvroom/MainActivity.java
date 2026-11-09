package fr.ouiouibaguette.vroomvroom;

import android.os.Bundle;
import android.view.View;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Android 15/16 (targetSdk 35+) : le WebView est dessiné edge-to-edge (sous la
 * barre de statut). On applique l'inset système du haut en padding sur la racine
 * du contenu pour repousser le header de l'app SOUS l'horloge — approche fiable
 * et indépendante du punch-hole / du type de layout racine.
 *
 * La bande de la barre de statut affiche le windowBackground natif :
 *   - light : #BDBDBD (gris moyen, = fond de l'app)
 *   - dark  : #252525 (noir, = fond de l'app)
 * et l'horloge/icônes sont BLANCHES dans les deux modes (windowLightStatusBar
 * = false, renforcé par le plugin @capacitor/status-bar côté web).
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            int top = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
            v.setPadding(v.getPaddingLeft(), top, v.getPaddingRight(), v.getPaddingBottom());
            return insets;
        });
    }
}
