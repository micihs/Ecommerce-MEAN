import { NgModule } from '@angular/core';
import { LazySrcDirective } from './lazy-src.directive';
import { LazyViewport } from './lazy-viewport';
import { LazyViewportDirective } from './lazy-viewport.directive';

@NgModule({
    declarations: [
        LazySrcDirective,
        LazyViewportDirective
    ],
    exports: [
        LazySrcDirective,
        LazyViewportDirective
    ],
    providers: [
        {
            provide: LazyViewport,
            useFactory: function() {
                var viewport = new LazyViewport();
                viewport.setup();
                return( viewport );
            }
        }
    ]
})
export class LazyModule { };