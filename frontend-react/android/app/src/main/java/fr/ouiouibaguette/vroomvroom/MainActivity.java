package fr.ouiouibaguette.vroomvroom;

import android.os.Bundle;
import android.view.View;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Android 15/16 (targetSdk 35+) impose l'edge-to-edge : sans correction, le
 * WebView est dessiné sous la barre de statut et le header de l'app
 * (sticky top-0) se retrouve masqué par l'horloge / les icônes, sur les
 * vrais appareils (notamment avec un trou punch-hole).
 *
 * On applique l'inset système du haut en padding sur la racine du contenu,
 * ce qui repousse tout l'app sous la barre de statut — comme un navigateur.
 * Indépendant du type de layout racine (CoordinatorLayout) et du cutout.
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
