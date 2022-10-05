import { Directive } from '@angular/core';
import { ElementRef } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { OnInit, Input } from '@angular/core';
import { Renderer2 } from '@angular/core';
import { LazyTarget } from './lazy-viewport';
import { LazyViewport } from './lazy-viewport';

@Directive({
    selector: '[lazySrc]'
})
export class LazySrcDirective implements OnInit, OnDestroy, LazyTarget {

    @Input('lazySrc') src: string;
    @Input('lazyBackground') backgroundUrl: string;
    @Input('lazySrcVisible') visibleClass: string;

    public element: Element;
    private lazyViewport: LazyViewport;
    private renderer: Renderer2;

    constructor(
        elementRef: ElementRef,
        lazyViewport: LazyViewport,
        renderer: Renderer2
        ) {
        this.element = elementRef.nativeElement;
        this.lazyViewport = lazyViewport;
        this.renderer = renderer;
        this.src = '';
        this.backgroundUrl = '';
        this.visibleClass = '';

    }

    public ngOnDestroy(): void {
        ( this.lazyViewport ) && this.lazyViewport.removeTarget( this );
    }

    public ngOnInit(): void {
        this.lazyViewport.addTarget( this );
    }

    public updateVisibility( isVisible: boolean, ratio: number ): void {

        if ( ! isVisible ) {
            return;
        }
        this.lazyViewport.removeTarget( this );
        this.lazyViewport = null;
        if (this.src) {
          this.renderer.setProperty( this.element, 'src', this.src );
        }
        if (this.backgroundUrl) {
          this.renderer.setStyle(this.element, 'background', this.backgroundUrl);
        }
        ( this.visibleClass ) && this.renderer.addClass( this.element, this.visibleClass );

    }

}