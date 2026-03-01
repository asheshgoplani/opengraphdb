package opengraphdb

/*
#cgo CFLAGS: -I${SRCDIR}/../../c
#include "opengraphdb.h"
#include <stdlib.h>
*/
import "C"

import (
	"encoding/json"
	"errors"
	"fmt"
	"unsafe"
)

const invalidID = ^uint64(0)

type Database struct {
	handle *C.struct_OgdbHandle
}

func Init(path string) (*Database, error) {
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))
	handle := C.ogdb_init(cPath)
	if handle == nil {
		return nil, wrapLastError("ogdb_init failed")
	}
	return &Database{handle: handle}, nil
}

func Open(path string) (*Database, error) {
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))
	handle := C.ogdb_open(cPath)
	if handle == nil {
		return nil, wrapLastError("ogdb_open failed")
	}
	return &Database{handle: handle}, nil
}

func (db *Database) Close() {
	if db == nil || db.handle == nil {
		return
	}
	C.ogdb_close(db.handle)
	db.handle = nil
}

func LastError() string {
	ptr := C.ogdb_last_error()
	if ptr == nil {
		return ""
	}
	return C.GoString(ptr)
}

func wrapLastError(message string) error {
	if err := LastError(); err != "" {
		return fmt.Errorf("%s: %s", message, err)
	}
	return errors.New(message)
}

func ensureOpen(db *Database) error {
	if db == nil || db.handle == nil {
		return errors.New("database is closed")
	}
	return nil
}

func (db *Database) Query(cypher string) (map[string]any, error) {
	if err := ensureOpen(db); err != nil {
		return nil, err
	}
	cCypher := C.CString(cypher)
	defer C.free(unsafe.Pointer(cCypher))
	ptr := C.ogdb_query(db.handle, cCypher)
	if ptr == nil {
		return nil, wrapLastError("ogdb_query failed")
	}
	defer C.ogdb_free(ptr)
	payload := C.GoString(ptr)
	var out map[string]any
	if err := json.Unmarshal([]byte(payload), &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (db *Database) CreateNode(labels []string, properties map[string]any) (uint64, error) {
	if err := ensureOpen(db); err != nil {
		return 0, err
	}
	if labels == nil {
		labels = []string{}
	}
	if properties == nil {
		properties = map[string]any{}
	}
	labelsPayload, err := json.Marshal(labels)
	if err != nil {
		return 0, err
	}
	propertiesPayload, err := json.Marshal(properties)
	if err != nil {
		return 0, err
	}

	cLabels := C.CString(string(labelsPayload))
	defer C.free(unsafe.Pointer(cLabels))
	cProperties := C.CString(string(propertiesPayload))
	defer C.free(unsafe.Pointer(cProperties))

	id := uint64(C.ogdb_create_node(db.handle, cLabels, cProperties))
	if id == invalidID {
		return 0, wrapLastError("ogdb_create_node failed")
	}
	return id, nil
}

func (db *Database) AddEdge(src, dst uint64, edgeType string, properties map[string]any) (uint64, error) {
	if err := ensureOpen(db); err != nil {
		return 0, err
	}
	if properties == nil {
		properties = map[string]any{}
	}
	propertiesPayload, err := json.Marshal(properties)
	if err != nil {
		return 0, err
	}

	var cEdgeType *C.char
	if edgeType != "" {
		cEdgeType = C.CString(edgeType)
		defer C.free(unsafe.Pointer(cEdgeType))
	}
	cProperties := C.CString(string(propertiesPayload))
	defer C.free(unsafe.Pointer(cProperties))

	id := uint64(C.ogdb_add_edge(
		db.handle,
		C.uint64_t(src),
		C.uint64_t(dst),
		cEdgeType,
		cProperties,
	))
	if id == invalidID {
		return 0, wrapLastError("ogdb_add_edge failed")
	}
	return id, nil
}

func (db *Database) Import(path string, format string) error {
	if err := ensureOpen(db); err != nil {
		return err
	}
	cFormat := C.CString(format)
	defer C.free(unsafe.Pointer(cFormat))
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))
	status := C.ogdb_import(db.handle, cFormat, cPath)
	if int32(status) != 0 {
		return wrapLastError("ogdb_import failed")
	}
	return nil
}

func (db *Database) Export(path string, format string) error {
	if err := ensureOpen(db); err != nil {
		return err
	}
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))
	cFormat := C.CString(format)
	defer C.free(unsafe.Pointer(cFormat))
	status := C.ogdb_export(db.handle, cPath, cFormat)
	if int32(status) != 0 {
		return wrapLastError("ogdb_export failed")
	}
	return nil
}

func (db *Database) Backup(destPath string) error {
	if err := ensureOpen(db); err != nil {
		return err
	}
	cPath := C.CString(destPath)
	defer C.free(unsafe.Pointer(cPath))
	status := C.ogdb_backup(db.handle, cPath)
	if int32(status) != 0 {
		return wrapLastError("ogdb_backup failed")
	}
	return nil
}

func (db *Database) Checkpoint() error {
	if err := ensureOpen(db); err != nil {
		return err
	}
	status := C.ogdb_checkpoint(db.handle)
	if int32(status) != 0 {
		return wrapLastError("ogdb_checkpoint failed")
	}
	return nil
}

func (db *Database) Metrics() (map[string]any, error) {
	if err := ensureOpen(db); err != nil {
		return nil, err
	}
	ptr := C.ogdb_metrics(db.handle)
	if ptr == nil {
		return nil, wrapLastError("ogdb_metrics failed")
	}
	defer C.ogdb_free(ptr)

	payload := C.GoString(ptr)
	var out map[string]any
	if err := json.Unmarshal([]byte(payload), &out); err != nil {
		return nil, err
	}
	return out, nil
}
