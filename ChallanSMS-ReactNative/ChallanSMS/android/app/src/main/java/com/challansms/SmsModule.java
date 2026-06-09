// android/app/src/main/java/com/challansms/SmsModule.java
// ─────────────────────────────────────────────────────────────────────────────
// Native Android module that sends SMS directly via SIM card
// Uses android.telephony.SmsManager — NO internet needed
// ─────────────────────────────────────────────────────────────────────────────

package com.challansms;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.telephony.SmsManager;
import android.util.Log;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.ArrayList;

public class SmsModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SmsModule";
    private static final String SMS_SENT_ACTION = "SMS_SENT_CHALLAN";

    private final ReactApplicationContext reactContext;

    public SmsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "SmsModule";
    }

    // ── sendSMS ───────────────────────────────────────────────────────────────
    // Called from JS: SmsModule.sendSMS(phone, message, onError, onSuccess)
    @ReactMethod
    public void sendSMS(String phoneNumber, String message,
                        Callback errorCallback, Callback successCallback) {
        try {
            Activity currentActivity = getCurrentActivity();
            if (currentActivity == null) {
                errorCallback.invoke("No current activity");
                return;
            }

            SmsManager smsManager = SmsManager.getDefault();

            // Split long messages (SMS max 160 chars, Hindi Unicode ~70 chars)
            ArrayList<String> parts = smsManager.divideMessage(message);

            // PendingIntent to track delivery
            String sentAction = SMS_SENT_ACTION + "_" + System.currentTimeMillis();

            PendingIntent sentPI = PendingIntent.getBroadcast(
                reactContext,
                0,
                new Intent(sentAction),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Register one-shot broadcast receiver for delivery confirmation
            BroadcastReceiver sentReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    switch (getResultCode()) {
                        case Activity.RESULT_OK:
                            Log.d(TAG, "SMS sent to: " + phoneNumber);
                            successCallback.invoke();
                            break;
                        default:
                            String err = "Send failed, code: " + getResultCode();
                            Log.e(TAG, err);
                            errorCallback.invoke(err);
                            break;
                    }
                    reactContext.unregisterReceiver(this);
                }
            };

            // Android 13+ (API 33+) requires an explicit export flag when registering
            // a runtime receiver. This receiver is for an app-internal action only,
            // so it must NOT be exported. (Fixes the Android 14 crash:
            // "One of RECEIVER_EXPORTED or RECEIVER_NOT_EXPORTED should be specified".)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(
                    sentReceiver,
                    new IntentFilter(sentAction),
                    Context.RECEIVER_NOT_EXPORTED
                );
            } else {
                reactContext.registerReceiver(
                    sentReceiver,
                    new IntentFilter(sentAction)
                );
            }

            // Send — multipart if message is long
            if (parts.size() == 1) {
                smsManager.sendTextMessage(phoneNumber, null, message, sentPI, null);
            } else {
                ArrayList<PendingIntent> sentIntents = new ArrayList<>();
                for (int i = 0; i < parts.size(); i++) sentIntents.add(sentPI);
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, null);
            }

        } catch (Exception e) {
            Log.e(TAG, "SMS error: " + e.getMessage());
            errorCallback.invoke(e.getMessage());
        }
    }

    // ── getSimCount — how many SIMs are inserted ──────────────────────────────
    @ReactMethod
    public void getSimCount(Callback callback) {
        try {
            android.telephony.TelephonyManager tm =
                (android.telephony.TelephonyManager)
                reactContext.getSystemService(Context.TELEPHONY_SERVICE);
            // Basic check — detailed dual-SIM API requires extra permissions
            callback.invoke(null, tm != null ? 1 : 0);
        } catch (Exception e) {
            callback.invoke(e.getMessage(), 0);
        }
    }
}
