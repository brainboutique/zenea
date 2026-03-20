<?php

namespace App\Services;

use App\Models\Secret;
use App\Models\Voucher;
use Illuminate\Support\Carbon;

class TelemetryService
{
    public function track($dimension, $value) {
        \Sentry\traceMetrics()->count($dimension, $value, []); // 'my-attribute' => 'foo'
    }
}
