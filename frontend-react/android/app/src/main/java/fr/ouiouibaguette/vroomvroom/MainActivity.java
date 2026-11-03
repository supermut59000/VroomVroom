package fr.ouiouibaguette.vroomvroom;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // targetSdk 35+ : Android 15/16 impose l'edge-to-edge (le WebView passe
        // sous la barre de statut et les boutons du header deviennent intouchables).
        // Opt-out : le contenu reste sous la barre de statut, sur tous les appareils.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        super.onCreate(savedInstanceState);
    }
}
